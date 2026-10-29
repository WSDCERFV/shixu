const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../planning-rhythm.cjs'),E=require('../planning-engine.cjs');
const date='2030-10-28',context={now:'2030-10-27T01:00:00Z',selectedDate:date,preferences:{start:'06:00',end:'23:59'},events:[]};
const task=(start,end,flexible=true)=>({id:'',action:'add',title:'学习练习',date,start,end,priority:3,tags:[],content:'做练习并复盘',schedule:{flexible,earliest:flexible?'08:00':start,latest:flexible?'17:00':end}}),plan=tasks=>({reply:'建议',tasks,plans:[]});
test('model context excludes meals, nap, overnight sleep and course travel without inserting calendar events',()=>{
 const course={id:'course',title:'固定课程',date,start:'10:00',end:'11:30',source:'course-import'},source={...context,events:[course]},before=JSON.stringify(source),{context:prepared}=E.prepare({context:source,messages:[{role:'user',content:'安排明天的学习'}]});
 for(const slot of prepared.freeSlots.filter(e=>e.date===date))for(const block of R.reservations(source,[date],[course]))assert.ok(slot.end<=block.start||slot.start>=block.end,JSON.stringify([slot,block]));
 assert.equal(prepared.rhythm.travelMinutes,15);assert.equal(prepared.events.length,1);assert.equal(JSON.stringify(source),before);
});
test('flexible lunch proposals move intact beyond lunch and nap; fixed meal or sleep intrusions fail clearly',()=>{
 const proposal=task('12:00','13:00');proposal.schedule.earliest='12:00';const checked=E.repair(plan([proposal]),context);assert.equal(checked.tasks[0].start,'13:30');assert.equal(checked.tasks[0].end,'14:30');assert.equal(checked.planning.adjustments.length,1);assert.equal(proposal.start,'12:00');
 assert.throws(()=>E.repair(plan([task('12:00','13:00',false)]),context),/午餐预留/);assert.throws(()=>E.repair(plan([task('23:30','23:50',false)]),context),/夜间睡眠/);
});
test('water courses still have a post-class journey and the existing course is never moved',()=>{
 const course={id:'water',title:'选修课',date,start:'08:00',end:'10:00',source:'course-import',locked:true,courseAllowOverlap:true},source={...context,events:[course]},checked=E.repair(plan([task('10:00','11:00')]),source);assert.equal(checked.tasks[0].start,'10:15');assert.equal(checked.tasks[0].end,'11:15');assert.equal(source.events[0].end,'10:00');assert.equal(E.repair(plan([task('08:00','09:00')]),source).tasks[0].start,'08:00');
});
test('explicit personal windows and dated nap changes are honored, negative instructions never cancel a rest',()=>{
 const rhythm=R.policy(['午休改为14:00-14:30，下课后预留20分钟','不要取消午休'],date),blocks=R.reservations({...context,rhythm},[date],[]);assert.ok(blocks.some(e=>e.title==='午休预留'&&e.start==='14:00'));assert.equal(rhythm.travelMinutes,20);
 const dated=R.policy(['今天取消午休'],date),days=[date,'2030-10-29'],after=R.reservations({...context,rhythm:dated},days,[]);assert.equal(after.filter(e=>e.title==='午休预留').length,1);assert.equal(after.find(e=>e.title==='午休预留').date,days[1]);
 const restored=R.policy(['取消午休','午休改为14:00-14:30'],date);assert.ok(R.reservations({...context,rhythm:restored},[date],[]).some(e=>e.title==='午休预留'));
 assert.equal(R.policy(['今天取消午休','安排新的学习计划'],date).overrides.length,0,'old relative-day instructions must not silently carry into a later request');
});
test('content-only edits keep a user-scheduled lunchtime task and manual draft times unchanged',()=>{
 const e={...task('12:00','13:00',false),id:'saved',action:'update'},checked=E.repair(plan([{...e,content:'更新步骤'}]),{...context,events:[e]});assert.equal(checked.tasks[0].start,'12:00');
 const d={...e,id:'draft',action:'add'},manual=E.repair(plan([d]),{...context,drafts:[{event:d,action:'add',selected:true,manualFields:['start','end']}]});assert.equal(manual.tasks[0].start,'12:00');
 const preserved=E.repair(plan([task('15:00','16:00')]),{...context,drafts:[{event:d,action:'add',selected:true,manualFields:['content']}]});assert.equal(preserved.tasks.find(t=>t.id==='draft').start,'12:00');
});
