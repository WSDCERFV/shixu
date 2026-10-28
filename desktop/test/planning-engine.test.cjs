const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepare,repair,freeSlots}=require('../planning-engine.cjs');
const {requestTuning}=require('../services.cjs');
const D=require('../planner-domain.cjs');
const date='2030-10-28',context={now:'2030-10-27T18:00:00+08:00',selectedDate:date,preferences:{start:'06:00',end:'23:30'},events:[],plans:[],drafts:[]};
const task=(title,start='09:30',end='10:30',flexible=true)=>({action:'add',id:'',title,date,start,end,priority:3,tags:['学习'],content:'先回顾重点，再独立练习并核对答案，最后记录错因和下一步。',assumption:'先给出可编辑建议。',planId:'',schedule:{flexible,earliest:flexible?'08:00':start,latest:flexible?'12:00':end}});
const lesson={id:'lesson',title:'固定课程',date,start:'09:00',end:'10:00',locked:true};
const result=tasks=>({reply:'先按已有空档安排。',tasks,plans:[]});
test('available slots merge overlapping occupations and never advertise elapsed minutes as free',()=>{
 assert.deepEqual(freeSlots([{...lesson,start:'08:00',end:'10:00'},{...lesson,start:'09:00',end:'11:00'}],date,'07:00','12:00'),[{date,start:'07:00',end:'08:00'},{date,start:'11:00',end:'12:00'}]);
 assert.equal(freeSlots([],date,'06:00','23:00',Date.parse(date+'T10:07:00+08:00'))[0].start,'10:10');
});
test('context uses relevant complete occupancy but compresses repetitive assistant plan history and omits feelings',()=>{
 const history=Array.from({length:20},()=>({role:'assistant',content:JSON.stringify({...result([task('长草案')]),private:'x'.repeat(8000)})}));
 const source={...context,events:[lesson,{...lesson,id:'old',date:'2020-01-01',feeling:'private diary'},{...lesson,id:'far',title:'远期预约',date:'2031-05-01'}],drafts:[{action:'add',selected:true,event:{id:'draft',title:'待确认安排',date,start:'11:00',end:'12:00'}}]};
 const prepared=prepare({context:source,messages:[...history,{role:'user',content:'先安排明天的学习'}]});
 assert.equal(prepared.context.events.length,1);assert.ok(!JSON.stringify(prepared).includes('private diary'));assert.ok(JSON.stringify(prepared.messages).length<3000);assert.ok(!prepared.context.freeSlots.some(s=>s.date===date&&s.start<'12:00'&&s.end>'11:00'));
 const explicit=prepare({context:source,messages:[{role:'user',content:'调整 2031-05-01 的预约'}]});assert.ok(explicit.context.events.some(e=>e.id==='far'));
});
test('flexible proposals avoid saved tasks and each other while preserving date, duration and original inputs',()=>{
 const source={...context,events:[lesson]},plan=result([task('数学'),task('英语')]),before=JSON.stringify({source,plan});
 const checked=repair(plan,source);assert.equal(checked.tasks[0].start,'10:00');assert.ok(checked.tasks.every(t=>t.date===date&&Date.parse(date+'T'+t.end)-Date.parse(date+'T'+t.start)===3600000));assert.ok(checked.tasks[0].end<=checked.tasks[1].start||checked.tasks[1].end<=checked.tasks[0].start);assert.equal(checked.planning.issues.length,0);assert.equal(checked.planning.adjustments.length,2);assert.equal(JSON.stringify({source,plan}),before);
});
test('fixed and manually adjusted times stay fixed and remain explicitly conflicted when impossible',()=>{
 const fixed=repair(result([task('固定预约','09:30','10:30',false)]),{...context,events:[lesson]});assert.equal(fixed.tasks[0].start,'09:30');assert.equal(fixed.planning.issues.length,1);
 const manual=task('手动草案');manual.id='draft';const checked=repair(result([manual]),{...context,events:[lesson],drafts:[{action:'add',event:manual,manualFields:['start','end']}]});assert.equal(checked.tasks[0].start,'09:30');assert.equal(checked.planning.adjustments.length,0);assert.ok(checked.planning.issues.length);
 const overlap=repair(result([task('固定一','09:00','10:00',false),task('固定二','09:30','10:30',false)]),context);assert.ok(overlap.planning.issues.length);
});
test('an explicit update or delete releases its old slot but never unlocks a course or invents IDs',()=>{
 const old={...lesson,id:'old',locked:false};const update={...task('移动旧任务','11:00','12:00',false),action:'update',id:'old'};
 assert.equal(repair(result([update,task('使用释放时段','09:00','10:00',false)]),{...context,events:[old]}).planning.issues.length,0);
 assert.throws(()=>repair(result([{...update,id:'missing'}]),context),/不存在/);
 assert.throws(()=>repair(result([{...update,id:'lesson'}]),{...context,events:[lesson]}),/锁定/);
});
test('remaining pending drafts are not silently dropped or allowed to overlap a new proposal',()=>{
 const pending={...task('手动保留的草案','10:00','11:00',false),id:'draft'};
 const checked=repair(result([task('新增需求')]),{...context,drafts:[{event:pending,action:'add',manualFields:['content']}]});
 assert.ok(checked.tasks.some(t=>t.id==='draft'));assert.equal(checked.planning.issues.length,0);
 const advice=repair(result([]),{...context,drafts:[{event:pending,action:'add'}]});assert.equal(advice.tasks.length,0);
});
test('daily rules expand for all checked dates and flexible daily rules use a common free clock time',()=>{
 const daily={id:'daily',kind:'daily',title:'每日阅读',goal:'每天读十页',content:'先阅读十页，再记录三个要点并复述一次。',startDate:date,endDate:'2030-11-05',start:'19:00',end:'20:00',weekdays:[1,2,3,4,5,6,7],priority:3,tags:['学习'],state:'active',milestones:[],schedule:{flexible:true,earliest:'18:00',latest:'22:00'}};
 const checked=repair({reply:'建议每天阅读。',tasks:[],plans:[daily]},{...context,events:[{...lesson,start:'18:00',end:'20:30'}]});assert.equal(checked.plans[0].start,'20:30');assert.equal(checked.plans[0].end,'21:30');assert.equal(checked.planning.issues.length,0);
 const futureDate='2031-10-28',existing={...daily,id:'existing',startDate:date,endDate:'',schedule:undefined};const proposal={...task('远期行动','19:00','20:00',false),date:futureDate};assert.ok(repair(result([proposal]),{...context,plans:[existing]}).planning.issues.length);
 const fixed={...daily,schedule:{flexible:false,earliest:'19:00',latest:'20:00'}};assert.ok(repair({reply:'固定阅读',tasks:[],plans:[fixed]},{...context,events:[{...lesson,start:'19:00',end:'20:00'}]}).planning.issues.length);
});
test('fast and balanced inference tuning is limited to the exact known official host and compatible models',()=>{
 const p={url:'https://api.deepseek.com',model:'deepseek-flash',protocol:'Chat Completions'};assert.equal(requestTuning(p).reasoning_effort,'low');assert.equal(requestTuning({...p,planningSpeed:'fast'}).thinking.type,'disabled');assert.equal(requestTuning({...p,planningSpeed:'deep'}).reasoning_effort,'high');assert.deepEqual(requestTuning({...p,url:'https://proxy.example.com'}),{});
 for(const model of ['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro']){assert.equal(requestTuning({...p,model}).max_tokens,65536,'thinking must have room for both reasoning and the final plan');assert.equal(requestTuning({...p,model,planningSpeed:'deep'}).max_tokens,65536);assert.equal(requestTuning({...p,model,planningSpeed:'fast'}).max_tokens,16384);}
 const open={url:'https://api.openai.com/v1',model:'gpt-6-luna',protocol:'Responses',reasoningSummary:true};assert.deepEqual(requestTuning(open).reasoning,{summary:'auto',effort:'low'});assert.deepEqual(requestTuning({...open,model:'custom-model'}),{});
});
test('daily updates preserve in-progress or individually edited occurrences as real occupied time',()=>{
 const rule={id:'r',kind:'daily',title:'阅读',goal:'读书',content:'阅读并记录要点。',startDate:date,endDate:'2030-11-01',start:'19:00',end:'20:00',weekdays:[1,2,3,4,5,6,7],priority:3,tags:[],state:'active',milestones:[]};
 const running={id:'routine-r-'+date,title:'正在进行的阅读',routineId:'r',routineModified:false,state:'doing',date,start:'19:00',end:'20:00'};
 const checked=repair({reply:'调整规则。',tasks:[task('同一时间的新增事项','19:00','20:00',false)],plans:[{...rule,start:'21:00',end:'22:00'}]},{...context,plans:[rule],events:[running]});
 assert.ok(checked.planning.issues.some(i=>i.other==='正在进行的阅读'));assert.equal(checked.plans[0].start,'21:00');
});
test('untouched pending daily plans are preserved without mutating their times or the caller context',()=>{
 const daily={id:'pending',kind:'daily',title:'手动每日计划',goal:'阅读',content:'阅读并记下三个要点。',startDate:date,endDate:'2030-11-01',start:'19:00',end:'20:00',weekdays:[1,2,3,4,5,6,7],priority:3,tags:[],state:'active',milestones:[],schedule:{flexible:true,earliest:'18:00',latest:'22:00'}};
 const source={...context,draftPlans:[daily]},before=JSON.stringify(source);const checked=repair(result([task('固定新预约','19:00','20:00',false)]),source);
 assert.equal(JSON.stringify(source),before);assert.equal(checked.plans[0].start,'19:00');assert.ok(checked.planning.issues.length);
});
test('different occupied calendars never produce an unreported overlap or silently shorten flexible tasks',()=>{
 let seed=1987;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 for(let run=0;run<80;run++){
   const occupied=Array.from({length:5},(_,i)=>{const n=480+random(20)*30;return {id:'o'+i,title:'已有'+i,date,start:time(n),end:time(n+30)};});
   const proposals=Array.from({length:4},(_,i)=>{const n=480+random(18)*30,duration=random(2)?30:60;return {...task('行动'+i,time(n),time(n+duration)),schedule:{flexible:true,earliest:'08:00',latest:'20:00'}};});
   const checked=repair(result(proposals),{...context,events:occupied});
   for(let i=0;i<checked.tasks.length;i++){const a=checked.tasks[i],original=proposals[i];assert.equal(Date.parse(date+'T'+a.end)-Date.parse(date+'T'+a.start),Date.parse(date+'T'+original.end)-Date.parse(date+'T'+original.start));assert.equal(a.date,original.date);}
   if(!checked.planning.issues.length){const all=[...occupied,...checked.tasks];for(let i=occupied.length;i<all.length;i++)for(let j=0;j<i;j++)assert.ok(all[i].end<=all[j].start||all[j].end<=all[i].start);}
 }
});
