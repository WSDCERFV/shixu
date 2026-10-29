const D=require('./planner-domain.cjs');
const rhythm=require('./planning-rhythm.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const minute=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const valid=e=>e&&D.validDate(e.date)&&D.validTime(e.start)&&D.validTime(e.end)&&e.end>e.start;
const overlaps=(a,b)=>((a.source==='rhythm-reserve'&&D.isCourse(b))||(b.source==='rhythm-reserve'&&D.isCourse(a)))?false:D.eventsConflict(a,b);
const today=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
function instant(context){const n=Date.parse(context.now);return Number.isFinite(n)?n:Date.now();}
function bounds(context){const p=context.preferences||{};return {start:D.validTime(p.start)?p.start:'06:00',end:D.validTime(p.end)?p.end:'23:30'};}
function calendar(context,from,to,removedRules=new Set(),dates=null){
  const records=new Map((context.events||[]).filter(valid).map(e=>[e.id,{...e}]));
  for(const d of context.protectedDrafts||[])if(d.selected!==false&&valid(d.event)){if(d.action==='delete')records.delete(d.event.id);else records.set(d.event.id,{...d.event});}
  const events=[...records.values()].filter(e=>!(removedRules.has(e.routineId)&&e.date>=today(instant(context))&&!e.routineModified&&e.state==='todo'));
  const seen=new Set(events.map(e=>e.id));
  for(const rule of context.plans||[]){
    if(rule.kind!=='daily'||removedRules.has(rule.id))continue;
    try{const p=D.normalizePlan(rule),generated=dates?dates.flatMap(date=>D.routineEvents(p,date,date,context.routineSkips||[])):D.routineEvents(p,from,to,context.routineSkips||[]);for(const e of generated)if(!seen.has(e.id)){events.push(e);seen.add(e.id);}}catch{/* Invalid rules remain visible in the editor, not invented as occupied time. */}
  }
  return events;
}
function freeSlots(events,date,start,end,now=null){
  let lo=minute(start),hi=minute(end);
  if(now!==null&&date===today(now)){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);lo=Math.max(lo,Math.ceil((minute(parts)+1)/5)*5);
  }
  if(lo>=hi)return [];
  const blocks=events.filter(e=>e.date===date&&valid(e)&&!D.isParallelCourse(e)).map(e=>[Math.max(lo,minute(e.start)),Math.min(hi,minute(e.end))]).filter(([a,b])=>a<b).sort((a,b)=>a[0]-b[0]);
  const result=[];let cursor=lo;for(const [a,b] of blocks){if(cursor<a)result.push({date,start:clock(cursor),end:clock(a)});cursor=Math.max(cursor,b);}if(cursor<hi)result.push({date,start:clock(cursor),end:clock(hi)});return result;
}
function compactEvent(e){return {id:String(e.id||''),title:String(e.title||'').slice(0,70),date:e.date,start:e.start,end:e.end,priority:e.priority,tags:(e.tags||[]).slice(0,6),content:String(e.content||'').slice(0,1000),locked:!!e.locked,state:e.state,routineId:e.routineId||'',routineModified:!!e.routineModified,source:e.source,courseAllowOverlap:D.isParallelCourse(e)};}
function prepare(input){
  const source=input.context||{},now=instant(source),selected=D.validDate(source.selectedDate)?source.selectedDate:today(now),dates=new Set(Array.from({length:14},(_,i)=>D.addDay(selected,i)));
  const recent=(input.messages||[]).slice(-24),latest=String(recent.at(-1)?.content||''),courseScope=D.courseEditScope(latest,source),editableCourses=new Set(courseScope.editableIds),editableDrafts=(source.drafts||[]).filter(d=>!D.isCourse(d.event)||editableCourses.has(d.event.id)).slice(0,30);
  for(const date of latest.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[])if(D.validDate(date)&&dates.size<60)dates.add(date);
  for(const d of editableDrafts)if(D.validDate(d.event?.date)&&dates.size<60)dates.add(d.event.date);
  for(const e of source.events||[])if(editableCourses.has(e.id)&&dates.size<60)dates.add(e.date);
  const range=[...dates].sort(),from=range[0],to=range.at(-1),p=bounds(source),all=calendar(source,from,to,new Set(),range),availability=[...all];
  for(const d of source.drafts||[])if(d.selected!==false&&valid(d.event)){const i=availability.findIndex(e=>e.id===d.event.id);if(i>=0)availability.splice(i,1);if(d.action!=='delete')availability.push(d.event);}
  for(const rule of source.draftPlans||[])if(rule.kind==='daily'&&rule.selected!==false){try{for(const date of range)availability.push(...D.routineEvents(D.normalizePlan(rule),date,date,source.routineSkips||[]));}catch{}}
  const rest=rhythm.policy(recent.filter(m=>m.role==='user').map(m=>m.content),today(now));availability.push(...rhythm.reservations({...source,rhythm:rest},range,availability));
  const relevant=all.filter(e=>dates.has(e.date)||editableCourses.has(e.id)||(!D.isCourse(e)&&((e.id&&latest.includes(e.id))||(e.title&&latest.includes(e.title)))));
  const context={now:source.now,timezone:source.timezone||'Asia/Shanghai',selectedDate:selected,preferences:p,draftMode:editableCourses.size?'course-import':'complete',events:relevant.slice(0,600).map(e=>D.isCourse(e)&&!editableCourses.has(e.id)?{title:e.title,date:e.date,start:e.start,end:e.end,readOnly:true,kind:'course',allowsParallel:D.isParallelCourse(e)}:compactEvent(e)),plans:(source.plans||[]).slice(0,30),drafts:editableDrafts.map(d=>({action:d.action,event:compactEvent(d.event),selected:d.selected,manualFields:d.manualFields,schedule:d.schedule})),draftPlans:(source.draftPlans||[]).slice(0,8),routineSkips:(source.routineSkips||[]).filter(s=>range.some(d=>String(s).endsWith('|'+d))),freeSlots:range.flatMap(date=>freeSlots(availability,date,p.start,p.end,now)),scope:{dates:range,editableCourseIds:courseScope.editableIds,courseEditsTruncated:courseScope.truncated,calendarComplete:relevant.length<=600,omittedEvents:all.length-Math.min(relevant.length,600)},skill:{name:'shixu-planner',version:'1.0'}};
  context.rhythm=rest;context.skill.version='1.1';
  // Drafts are the canonical editable plan. Do not repeat their full JSON in every history turn.
  let budget=36000;const messages=[];
  for(const m of recent.slice().reverse()){
    let content=String(m.content||'');
    if(m.role==='assistant'){try{const data=JSON.parse(content);if(typeof data.reply==='string')content=data.reply;}catch{}content=content.slice(0,1200);}else content=content.slice(0,2400);
    if(content.length>budget)break;budget-=content.length;messages.unshift({role:m.role==='assistant'?'assistant':'user',content});
  }
  return {context,messages,stats:{eventsSent:context.events.length,eventsAvailable:all.length,historySent:messages.length,historyAvailable:(input.messages||[]).length}};
}
function schedule(raw,event){
  if(raw===undefined)return {flexible:false,earliest:event.start||'',latest:event.end||''};
  if(!raw||typeof raw.flexible!=='boolean')throw new Error('AI 的可调整时间范围无效，请重试。');
  if(!event.start&&!event.end&&!raw.flexible)return {flexible:false,earliest:'',latest:''};
  if(!D.validTime(raw.earliest)||!D.validTime(raw.latest)||raw.latest<=raw.earliest)throw new Error('AI 的可调整时间范围无效，请重试。');
  if(raw.flexible&&minute(raw.latest)-minute(raw.earliest)<minute(event.end)-minute(event.start))throw new Error('AI 给出的可用时间不足以完成任务，原草案已保留。');
  return {flexible:raw.flexible,earliest:raw.earliest,latest:raw.latest};
}
function nearest(events,event,window,context){
  const lo=window.earliest,hi=window.latest,duration=minute(event.end)-minute(event.start);
  if(hi<=lo)return null;
  return freeSlots(events,event.date,lo,hi,instant(context)).filter(slot=>minute(slot.end)-minute(slot.start)>=duration).map(slot=>{
    const start=Math.max(minute(slot.start),Math.min(minute(event.start),minute(slot.end)-duration));return {date:event.date,start:clock(start),end:clock(start+duration),distance:Math.abs(start-minute(event.start))};
  }).sort((a,b)=>a.distance-b.distance||a.start.localeCompare(b.start))[0]||null;
}
function repair(plan,context={}){
  const result=copy(plan),issues=[],adjustments=[],courseScope=D.courseEditScope(context.requestText||'',context),allowedCourses=new Set(courseScope.editableIds),courses=new Map([...(context.events||[]),...(context.protectedDrafts||[]).map(d=>d.event),...(context.drafts||[]).map(d=>d.event)].filter(D.isCourse).map(e=>[e.id,e]));let protectedCount=0;
  result.tasks=(result.tasks||[]).filter(t=>{const old=courses.get(t.id),sameCourse=[...courses.values()].filter(e=>e.title===t.title&&e.date===t.date),study=String(context.requestText||'').includes(t.title)&&/(?:复习|预习|自学|练习|做题|作业|学习)/.test(context.requestText||''),echo=sameCourse.some(e=>e.start===t.start&&e.end===t.end)||sameCourse.length&&!study;if(old){if(!allowedCourses.has(t.id)||t.action==='add'||(t.action==='delete'&&!courseScope.deletableIds.includes(t.id))){protectedCount++;return false;}for(const k of ['title','priority','tags','content','planId','state'])if(old[k]!==undefined)t[k]=copy(old[k]);if(t.action!=='delete'&&t.date===old.date&&t.start===old.start&&t.end===old.end)return false;}else if((t.action==='add'&&echo)||(t.action!=='add'&&[...courses.values()].some(e=>e.title===t.title))){protectedCount++;return false;}return true;});
  const tasks=result.tasks,plans=result.plans||[];
  const directTasks=new Set(tasks),directPlanIds=new Set(plans.map(p=>p.id));
  // A model omission is not permission to discard an existing editable draft.
  if(context.draftMode!=='course-import'&&(tasks.length||plans.length)){
    const returned=new Set(tasks.map(t=>t.id).filter(Boolean));
    for(const d of context.drafts||[])if(d.event?.id&&!returned.has(d.event.id)&&!D.isCourse(d.event))tasks.push({...copy(d.event),action:d.action||'add',assumption:d.assumption||'',schedule:d.schedule||{flexible:false,earliest:d.event.start,latest:d.event.end}});
    const ids=new Set(plans.map(p=>p.id));for(const p of context.draftPlans||[])if(!ids.has(p.id))plans.push(copy(p));
  }
  const allDays=[...tasks.map(t=>t.date),...plans.map(p=>p.startDate),D.validDate(context.selectedDate)?context.selectedDate:today(instant(context))].filter(D.validDate).sort();
  const from=allDays[0],to=allDays.at(-1),priorPlans=new Map((context.draftPlans||[]).map(p=>[p.id,p])),updatedRules=new Set(plans.filter(p=>p.kind==='daily'&&priorPlans.get(p.id)?.selected!==false).map(p=>p.id)),checkDates=new Set(allDays);
  const plannedRules=[...plans,...(context.draftPlans||[]).filter(p=>p.kind==='daily'&&!plans.some(x=>x.id===p.id)).map(copy)];
  for(const p of plannedRules.filter(p=>p.kind==='daily')){const start=p.startDate>today(instant(context))?p.startDate:today(instant(context));for(let i=0;i<=30;i++)checkDates.add(D.addDay(start,i));}
  let occupied=calendar(context,from,to,updatedRules,[...checkDates]);
  const existing=new Map((context.events||[]).map(e=>[e.id,e])),drafts=new Map((context.drafts||[]).map(d=>[d.event?.id,d]));
  for(const t of tasks){
    const old=existing.get(t.id),prior=drafts.get(t.id)?.event;delete t.courseAllowOverlap;if(D.isCourse(old||prior))t.courseAllowOverlap=D.isParallelCourse(old||prior),t.source='course-import';
    if(t.action!=='add'&&!old&&!prior)throw new Error('AI 引用了不存在的任务，原草案已保留。');
    if(old?.locked&&!allowedCourses.has(old.id)&&(t.action==='delete'||['title','date','start','end'].some(k=>t[k]!==old[k])))throw new Error('AI 试图更改锁定任务，原安排已保留。');
  }
  const replaced=new Set(tasks.filter(t=>(t.action==='update'||t.action==='delete')&&drafts.get(t.id)?.selected!==false).map(t=>t.id));occupied=occupied.filter(e=>!replaced.has(e.id));
  // Unchanged pending drafts still reserve their slots, including partial course edits.
  const returned=new Set(tasks.map(t=>t.id).filter(Boolean));
  for(const d of context.drafts||[])if(d.selected!==false&&!returned.has(d.event?.id)&&valid(d.event)){occupied=occupied.filter(e=>e.id!==d.event.id);if(d.action!=='delete')occupied.push({...d.event});}
  const note=(item,before,after)=>{adjustments.push({title:item.title,date:before.date,from:before.start+'–'+before.end,to:after.start+'–'+after.end});item.assumption=[item.assumption,'本地排程避让：'+before.start+'–'+before.end+' → '+after.start+'–'+after.end+'（日期和时长保留）'].filter(Boolean).join('；').slice(0,500);};
  const active=tasks.filter(t=>t.action!=='delete'&&drafts.get(t.id)?.selected!==false),fixed=[],flex=[];
  for(const t of active){t.schedule=schedule(t.schedule,t);const manual=drafts.get(t.id)?.manualFields||[];(directTasks.has(t)&&t.schedule.flexible&&!manual.some(k=>['date','start','end'].includes(k))?flex:fixed).push(t);}
  // Fixed commitments take precedence over all flexible model proposals.
  occupied.push(...fixed);
  occupied.push(...rhythm.reservations(context,[...checkDates],occupied));
  for(const p of plannedRules.filter(p=>p.kind==='daily'&&p.state==='active'&&p.selected!==false&&priorPlans.get(p.id)?.selected!==false)){
    const start=p.startDate>today(instant(context))?p.startDate:today(instant(context)),end=p.endDate&&p.endDate<D.addDay(start,30)?p.endDate:D.addDay(start,30);
    const protectedIds=new Set(occupied.filter(e=>e.routineId===p.id&&(e.routineModified||e.state!=='todo')).map(e=>e.id));
    const occurrences=D.routineEvents(p,start,end,context.routineSkips||[]).filter(e=>!protectedIds.has(e.id));p.schedule=schedule(p.schedule,p);
    const manual=priorPlans.get(p.id)?.manualFields||[];
    if(directPlanIds.has(p.id)&&p.schedule.flexible&&!manual.some(k=>['start','end','startDate','endDate','weekdays'].includes(k))&&occurrences.some(e=>occupied.some(o=>overlaps(e,o)))){
      const duration=minute(p.end)-minute(p.start),candidates=[];
      for(let n=minute(p.schedule.earliest);n+duration<=minute(p.schedule.latest);n+=5)candidates.push(n);
      candidates.sort((a,b)=>Math.abs(a-minute(p.start))-Math.abs(b-minute(p.start))||a-b);
      const found=candidates.find(n=>occurrences.every(e=>!occupied.some(o=>overlaps({...e,start:clock(n),end:clock(n+duration)},o))));
      if(found!==undefined){const before={date:start,start:p.start,end:p.end};p.start=clock(found);p.end=clock(found+duration);note(p,before,{start:p.start,end:p.end});}
    }
    const final=D.routineEvents(p,start,end,context.routineSkips||[]).filter(e=>!protectedIds.has(e.id));
    for(const e of final)for(const o of occupied)if(o.id!==e.id&&overlaps(e,o))issues.push({title:p.title,planId:p.id,date:e.date,start:e.start,end:e.end,other:o.title,rhythm:o.source==='rhythm-reserve',kind:'daily'});
    occupied.push(...final);
  }
  for(const t of flex.sort((a,b)=>a.priority-b.priority)){
    if(t.date<today(instant(context)))throw new Error('“'+t.title+'”的建议日期已经过去，请改为未来日期；原草案已保留。');
    const outside=t.start<t.schedule.earliest||t.end>t.schedule.latest,conflict=occupied.some(o=>overlaps(t,o)),now=instant(context),expired=t.date===today(now)&&(freeSlots([],t.date,t.start,t.end,now)[0]?.start!==t.start);
    if(conflict||outside||expired){const slot=nearest(occupied,t,t.schedule,context);if(slot){const before={...t};t.start=slot.start;t.end=slot.end;note(t,before,t);}else if(outside||expired)throw new Error('“'+t.title+'”在指定时间范围内没有足够空档，请扩大可用范围或分批安排；原草案已保留。');}
    occupied.push(t);
  }
  for(const t of active)for(const o of occupied)if(o!==t&&o.id!==t.id&&overlaps(t,o)){
    // New tasks may all have the empty ID; identity, not empty IDs, distinguishes them.
    issues.push({title:t.title,taskId:t.id,date:t.date,start:t.start,end:t.end,other:o.title,rhythm:o.source==='rhythm-reserve',kind:'task'});
  }
  // Check empty-ID proposals too, without treating a task as a conflict with itself.
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)if(!active[i].id&&!active[j].id&&overlaps(active[i],active[j]))issues.push({title:active[i].title,date:active[i].date,start:active[i].start,end:active[i].end,other:active[j].title,kind:'task'});
  const unique=[...new Map(issues.map(i=>[[i.date,i.start,i.end,i.taskId||'',i.rhythm?'rest':'event',...[i.title,i.other].sort()].join('|'),i])).values()];
  function preservedRestTime(issue){
    if(issue.kind==='daily'){const p=plans.find(p=>p.id===issue.planId),before=[...(context.plans||[]),...(context.draftPlans||[])].find(p=>p.id===issue.planId);return !directPlanIds.has(issue.planId)||before&&p&&['start','end'].every(k=>p[k]===before[k]);}
    const t=tasks.find(t=>issue.taskId&&t.id===issue.taskId);if(!t)return false;const before=existing.get(t.id)||drafts.get(t.id)?.event;return !directTasks.has(t)||(drafts.get(t.id)?.manualFields||[]).some(k=>['date','start','end'].includes(k))||before&&['date','start','end'].every(k=>t[k]===before[k]);
  }
  const restIssues=unique.filter(i=>i.rhythm&&!preservedRestTime(i)),visibleIssues=unique.filter(i=>!i.rhythm||!preservedRestTime(i));
  const blocked=restIssues.find(i=>!unique.some(other=>other.taskId===i.taskId&&other.date===i.date&&other.title===i.title&&!other.rhythm));
  if(blocked)throw new Error(`“${blocked.title}”占用了${blocked.other}，当前可用范围不足。请扩大安排范围或明确调整作息；已保存课程和任务未改变。`);
  result.planning={skill:'shixu-planner',version:'1.1',adjustments,issues:visibleIssues,checkedDailyDays:31,editableCourseIds:courseScope.editableIds,protectedCourses:protectedCount};
  if(protectedCount){const note='已忽略 '+protectedCount+' 项未经指定的课程改动或重复课程，原课程保持不变。';result.reply=tasks.length||plans.length?result.reply+'\n\n'+note:note+'如需调课，请明确课程名称及原日期；普通排程无需修改课程。';}
  if(adjustments.length)result.reply+='\n\n本地排程检查：已为 '+adjustments.length+' 项可调整安排避让时间冲突，日期和时长保留。';
  if(visibleIssues.length)result.reply+='\n\n仍需调整：'+visibleIssues.slice(0,4).map(i=>`${i.date} ${i.start}–${i.end}“${i.title}”与“${i.other}”重叠`).join('；')+'。固定时间未擅自移动，解决冲突后再确认。';
  return result;
}
module.exports={prepare,repair,freeSlots,schedule,calendar};
