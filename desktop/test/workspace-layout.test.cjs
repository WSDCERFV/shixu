const {test}=require('node:test'),assert=require('node:assert/strict'),W=require('../workspace-layout.cjs'),D=require('../planner-domain.cjs');
function clear(items){for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.equal(W.overlap(items[i],items[j]),false,`${items[i].id} overlaps ${items[j].id}`);}
test('layout edits keep modules within 12 columns, move neighbors aside, and never lose or duplicate a module',()=>{
 let items=W.defaults('minimal');clear(items);items=W.place(items,'week',{x:0,y:0,w:9,h:14});clear(items);assert.deepEqual(items.find(i=>i.id==='week'),{id:'week',x:0,y:0,w:9,h:14});assert.equal(items.length,3);items=W.place(items,'plans');clear(items);assert.equal(items.length,4);assert.equal(new Set(items.map(i=>i.id)).size,4);assert.deepEqual(W.defaults('minimal').map(i=>i.id),['today','week','ai']);
 for(let n=0;n<50;n++){items=W.place(items,'today',{x:n%16-2,y:n%10,w:n%15,h:n%30});clear(items);const i=items.find(i=>i.id==='today');assert.ok(i.x>=0&&i.x+i.w<=12&&i.h>=6&&i.h<=24);}
 assert.deepEqual(W.normalize([{id:'unknown'},{id:'week',w:Infinity},{id:'week'}]).map(i=>i.id),['week']);
});
test('feature toggles hide modules without mutating the saved layout or deleting records',()=>{
 const items=W.defaults('normal'),before=JSON.stringify(items),visible=W.visible(items,{features:{stats:false,focus:false}});assert.ok(!visible.some(i=>['stats','focus'].includes(i.id)));assert.equal(JSON.stringify(items),before);assert.equal(W.visible(items,{features:{}}).length,items.length);assert.equal(W.normalize(null),null);assert.deepEqual(W.normalize([]),[]);
});
test('storage accepts empty or independent mode layouts but rejects damaged or overlapping preferences',()=>{
 const {validateWorkspace}=require('../local-store.cjs'),value=p=>({privateContent:{v:3,e:[],p}});assert.doesNotThrow(()=>validateWorkspace(value({dashboardLayouts:{normal:[],minimal:W.defaults('minimal')},features:{stats:false},weekDisplay:'fit'})));
 for(const p of [{features:[]},{features:{stats:'false'}},{weekDisplay:'other'},{dashboardLayouts:[]},{dashboardLayouts:{normal:[{id:'week',x:10,y:0,w:6,h:12}]}},{dashboardLayouts:{normal:[{id:'week',x:0,y:0,w:6,h:12},{id:'today',x:0,y:0,w:3,h:12}]}}])assert.throws(()=>validateWorkspace(value(p)));
});
test('old autumn courses accidentally dated as spring are diagnosed by teaching weeks and repair is a pure preview',()=>{
 const base={source:'course-import',sourceId:'2026-2027-2',school:'东南大学',title:'测试课程',start:'08:00',end:'09:00',room:'测试教室',feeling:'保留的心得'},events=Array.from({length:12},(_,i)=>({...base,id:'c'+i,teachingWeek:i+1,date:D.addDay('2027-02-22',i*7+2)})),caches=[{school:'东南大学',termName:'2026-2027学年秋季学期',termCode:'2026-2027-2'}],before=JSON.stringify(events),issues=D.courseCalendarAudit(events,caches);
 assert.equal(issues.length,1);assert.equal(issues[0].actual,'2027-02-22');assert.equal(issues[0].expected,'2026-09-21');const fixed=D.courseCalendarRepair(events,issues[0]);assert.equal(JSON.stringify(events),before);assert.equal(fixed[5].date,'2026-10-28');assert.equal(fixed[5].id,events[5].id);assert.equal(fixed[5].feeling,base.feeling);assert.equal(fixed[5].courseOriginal.date,'2026-10-28');assert.equal(D.courseCalendarAudit(fixed,caches).length,0);
 assert.equal(D.courseCalendarRepair([{...events[0],courseAdjusted:{kind:'manual'}}],issues[0]).length,0);assert.equal(D.courseCalendarAudit([events[0]],caches).length,0);assert.equal(D.seuSemesterMonday('2026-2027学年暑期学期'),'');
 assert.equal(D.newCourseSessions(fixed,fixed.map(e=>({...e,id:'new-'+e.id}))).length,0,'reimport after date repair must not duplicate sessions whose IDs were originally derived from wrong dates');
});
test('an unrelated change request in another clause does not authorize changes to mentioned courses',()=>{
 const course={id:'physics',source:'course-import',title:'大学物理',date:'2030-10-28',locked:true},context={events:[course],selectedDate:course.date};for(const text of ['帮我调整英语，今天还有大学物理','大学物理明天上课，调整我的晚间任务','调整大学物理复习安排','不要修改大学物理，调整英语'])assert.deepEqual(D.courseEditScope(text,context).editableIds,[]);
 assert.deepEqual(D.courseEditScope('大学物理调休到明天下午',context).editableIds,['physics']);
});
