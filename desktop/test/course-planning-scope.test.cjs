const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../planner-domain.cjs'),E=require('../planning-engine.cjs');
const date='2030-10-28',course={id:'physics',source:'course-import',title:'大学物理实验',date,start:'08:00',end:'09:00',priority:3,tags:['课程'],content:'教室A101 · 任课教师 · 教学周与原始课程要求',state:'todo',locked:false,planId:''};
const context={now:'2030-10-27T18:00:00+08:00',selectedDate:date,events:[course,{...course,id:'circuits',title:'电路基础',start:'10:00',end:'11:00'},{...course,id:'physics-next',date:D.addDay(date,7)}],drafts:[],plans:[]};
const task=(title='英语复习')=>({action:'add',id:'',title,date,start:'13:30',end:'14:30',priority:3,tags:['学习'],content:'先回顾重点，再完成练习并核对，最后整理错因和后续步骤。',assumption:'空闲时段安排。',planId:'',schedule:{flexible:false,earliest:'13:30',latest:'14:30'}}),plan=tasks=>({reply:'只处理本轮需求。',tasks,plans:[]});
test('ordinary plans, study revisions and explicitly unchanged courses never grant course editing permission',()=>{
 for(const text of ['帮我安排一小时英语复习','不要修改大学物理实验，安排英语','调整大学物理实验复习计划','帮我修改数据结构学习安排，课程不要改动','给我安排其他任务，大学物理实验保持原样'])assert.deepEqual(D.courseEditScope(text,context).editableIds,[]);
 assert.deepEqual(D.courseEditScope('把2030-10-28的大学物理实验改到下午，电路基础保持原样',context).editableIds,['physics']);
});
test('course edits target the original occurrence, relative dates or focused course without expanding to a semester',()=>{
 for(const text of ['把2030-10-28的大学物理实验改到2030-11-04下午','把10月28日的大学物理实验改到下午','把明天的大学物理实验改到11点','把本周一的大学物理实验改到11点','调整大学物理实验，其他全部保持不变'])assert.deepEqual(D.courseEditScope(text,context).editableIds,['physics']);
 assert.deepEqual(D.courseEditScope('把它改到11点',{...context,focusedEventId:'physics'}).editableIds,['physics']);
 assert.deepEqual(D.courseEditScope('把它改到11点',context).editableIds,[]);
 const many={...context,events:Array.from({length:40},(_,i)=>({...course,id:'p'+i,date:D.addDay(date,7*i)}))},scope=D.courseEditScope('调整所有大学物理实验到下午',many);assert.equal(scope.editableIds.length,30);assert.equal(scope.truncated,true);
});
test('a full semester stays local while the model sees short nearby occupancy and only explicitly editable course IDs',()=>{
 const courses=Array.from({length:240},(_,i)=>({...course,id:'c'+i,date:D.addDay(date,i),content:'不应重复发送的完整课程说明'.repeat(50)})),source={...context,events:courses,protectedDrafts:courses.map(event=>({event,selected:true,action:'update'}))};
 const prepared=E.prepare({context:source,messages:[{role:'user',content:'安排英语复习，大学物理实验保持原样'}]});assert.equal(prepared.context.events.length,14);assert.ok(prepared.context.events.every(e=>e.readOnly&&!e.id&&!e.content));assert.equal(prepared.context.protectedDrafts,undefined);assert.equal(prepared.context.drafts.length,0);assert.ok(JSON.stringify(prepared.context).length<12000);assert.ok(!prepared.context.freeSlots.some(s=>s.date===date&&s.start<'09:00'&&s.end>'08:00'));
 const edit=E.prepare({context:source,messages:[{role:'user',content:'把2030-10-28的大学物理实验改到11点'}]});assert.deepEqual(edit.context.scope.editableCourseIds,['c0']);assert.equal(edit.context.events.filter(e=>e.id).length,1);assert.equal(edit.context.events.length,14);
});
test('unauthorized course moves, deletions and copies are ignored while a useful ordinary task survives',()=>{
 const bad=[{...task(course.title),id:course.id,action:'update'},{...task(course.title),id:course.id,action:'delete'},{...task(course.title),id:course.id},{...task(course.title),start:course.start,end:course.end},{...task(course.title),start:'16:00',end:'17:00'}],source={...context,requestText:'帮我安排英语复习，课程不要改动'},input=plan([task(),...bad]),before=JSON.stringify({source,input}),checked=E.repair(input,source);
 assert.equal(checked.tasks.length,1);assert.equal(checked.tasks[0].title,'英语复习');assert.equal(checked.planning.protectedCourses,5);assert.equal(checked.planning.issues.length,0);assert.equal(JSON.stringify({source,input}),before);
 const study=E.repair(plan([{...task(course.title),start:'16:00',end:'17:00'}]),{...context,requestText:'安排大学物理实验复习'});assert.equal(study.tasks.length,1,'a separately requested study task is not a duplicate imported course');
});
test('explicitly requested rescheduling preserves metadata and only overrides course fixation for the named occurrence',()=>{
 const change={...task(course.title),id:course.id,action:'update',start:'11:00',end:'12:00'},source={...context,requestText:'把2030-10-28的大学物理实验改到11:00–12:00'},checked=E.repair(plan([change,{...change,id:'physics-next',date:D.addDay(date,7)}]),source);
 assert.equal(checked.tasks.length,1);assert.equal(checked.tasks[0].content,course.content);assert.deepEqual(checked.tasks[0].tags,course.tags);assert.equal(checked.tasks[0].start,'11:00');assert.equal(checked.planning.issues.length,0);
 assert.equal(E.repair(plan([{...change,action:'delete'}]),source).tasks.length,0);
 assert.equal(E.repair(plan([{...change,action:'delete'}]),{...source,requestText:'取消2030-10-28的大学物理实验'}).tasks.length,1);
 assert.equal(E.repair(plan([change]),{...source,events:[{...course,locked:true}]}).tasks[0].start,'11:00');
 assert.equal(E.repair(plan([change]),{...source,requestText:'调整英语复习，大学物理实验下周有考试',events:[{...course,locked:true}]}).tasks.length,0);
});
test('unconfirmed course drafts reserve time once, remain unchanged and never become echoed model output',()=>{
 const pending={...course,start:'11:00',end:'12:00'},source={...context,drafts:[{event:pending,action:'update',selected:true}]};
 const checked=E.repair(plan([task()]),source);assert.equal(checked.tasks.length,1);assert.equal(checked.planning.issues.length,0);
 const prepared=E.prepare({context:source,messages:[{role:'user',content:'只安排英语复习'}]});assert.equal(prepared.context.drafts.length,0);assert.ok(prepared.context.freeSlots.some(s=>s.date===date&&s.start<='08:00'&&s.end>='10:00'));assert.ok(!prepared.context.freeSlots.some(s=>s.date===date&&s.start<'12:00'&&s.end>'11:00'));
 const protectedOnly=E.repair(plan([{...task(),start:'11:00',end:'12:00'}]),{...context,protectedDrafts:[{event:pending,action:'update',selected:true}]});assert.ok(protectedOnly.planning.issues.length);
});
test('old confirmed import copies are pruned without changing saved courses or a manually edited draft',()=>{
 const copy={event:{...course},action:'add',before:null,manual:[],selected:true},manual={event:{...course,id:'circuits',title:'电路基础',start:'16:00',end:'17:00'},before:null,action:'add',manual:['start','end'],selected:true},ordinary={event:{...task(),id:'new'},action:'add',manual:[],selected:true},drafts=[copy,manual,ordinary],before=JSON.stringify({drafts,events:context.events});
 assert.equal(D.cleanConfirmedCourseDrafts(drafts,context.events,false,false).length,3);
 const clean=D.cleanConfirmedCourseDrafts(drafts,context.events,true,false);assert.equal(clean.length,2);assert.equal(clean[0].selected,true);assert.equal(clean[0].action,'update');assert.equal(clean[0].before.start,'10:00');assert.equal(clean[1],ordinary);assert.equal(JSON.stringify({drafts,events:context.events}),before);
});
test('study requests and negative instructions never unlock the underlying course, and unrelated task deletion grants no course deletion',()=>{
 for(const text of ['帮我调整复习大学物理实验的时间','取消自学大学物理实验的计划','我不希望调整大学物理实验，安排英语'])assert.deepEqual(D.courseEditScope(text,context).editableIds,[]);
 const source={...context,requestText:'把2030-10-28的大学物理实验改到下午，删除英语复习'},scope=D.courseEditScope(source.requestText,source);assert.deepEqual(scope.editableIds,['physics']);assert.deepEqual(scope.deletableIds,[]);assert.equal(E.repair(plan([{...task(course.title),id:course.id,action:'delete'}]),source).tasks.length,0);
 assert.deepEqual(D.courseEditScope('取消这节课',{...context,focusedEventId:'physics'}).deletableIds,['physics']);
});
