const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../planner-domain.cjs');
const { parsePlan } = require('../services.cjs');
const daily = { id:'reading',kind:'daily',title:'每日阅读',startDate:'2026-10-23',endDate:'2026-11-01',start:'20:00',end:'20:30',weekdays:[1,3,5],priority:3,goal:'读完一本专业书',tags:['学习'],milestones:[],state:'active' };
test('daily rules honor weekdays, start/end dates, pauses and per-date exclusions',()=>{
 const rule=D.normalizePlan(daily),items=D.routineEvents(rule,'2026-10-19','2026-11-08',['reading|2026-10-26']);
 assert.deepEqual(items.map(x=>x.date),['2026-10-23','2026-10-28','2026-10-30']);
 assert.equal(new Set(items.map(x=>x.id)).size,items.length);assert.equal(D.routineEvents({...rule,state:'paused'},'2026-10-23','2026-11-01').length,0);
 assert.throws(()=>D.normalizePlan({...daily,end:'19:00'}));assert.throws(()=>D.normalizePlan({...daily,weekdays:[]}));
});
test('long term plans need a deadline and phases within the plan range',()=>{
 const plan={...daily,kind:'long',milestones:[{title:'第一轮复习',due:'2026-10-28',done:false}]};
 assert.equal(D.normalizePlan(plan).milestones[0].due,'2026-10-28');assert.throws(()=>D.normalizePlan({...plan,endDate:''}));assert.throws(()=>D.normalizePlan({...plan,milestones:[{title:'越界',due:'2027-01-01'}]}));
 const result=parsePlan(JSON.stringify({reply:'建议分为阶段执行。',tasks:[],plans:[plan]}));assert.equal(result.plans.length,1);assert.equal(result.tasks.length,0);
});
test('course CSV supports exact dates, quoted titles, weekly semesters and stable IDs',()=>{
 const dated='课程,日期,开始,结束,教室,教师\n"写作,表达",2026/10/23,8:00,09:35,A101,张老师\n坏记录,2026-02-30,08:00,09:00,,\n';
 const a=D.parseCourses(dated,{school:'示例学校'}),b=D.parseCourses(dated,{school:'示例学校'});
 assert.equal(a.events.length,1);assert.equal(a.events[0].title,'写作,表达');assert.equal(a.events[0].start,'08:00');assert.equal(a.errors.length,1);assert.equal(a.events[0].id,b.events[0].id);
 const repeated=D.parseCourses('课程,星期,周次,开始,结束\n高数,周一,1-4单周,08:00,09:35',{school:'东南大学',firstMonday:'2026-10-19'});
 assert.deepEqual(repeated.events.map(e=>e.date),['2026-10-19','2026-11-02']);
 assert.notEqual(D.parseCourses(dated,{school:'另一个学校'}).events[0].id,a.events[0].id);
});
test('ICS handles unfolded text, UTC to Shanghai, weekly rules and excluded dates',()=>{
 const text='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test-course\r\nSUMMARY:课程\\,专题\r\nDTSTART:20261019T000000Z\r\nDTEND:20261019T013500Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4\r\nEXDATE:20261026T000000Z\r\nLOCATION:教学楼\r\n A101\r\nEND:VEVENT\r\nEND:VCALENDAR';
 const out=D.parseCourses(text,{school:'另一所大学'});assert.equal(out.errors.length,0);assert.deepEqual(out.events.map(e=>e.date),['2026-10-19','2026-11-02','2026-11-09']);assert.equal(out.events[0].start,'08:00');assert.equal(out.events[0].room,'教学楼A101');
 const invalid=text.replace('FREQ=WEEKLY;BYDAY=MO;COUNT=4','FREQ=MONTHLY;COUNT=4');const rejected=D.parseCourses(invalid);assert.equal(rejected.events.length,0);assert.equal(rejected.errors.length,1);
});
test('mixed odd/even CSV weeks retain both segments instead of silently losing all classes',()=>{
 assert.deepEqual(D.parseWeeks('1-4单周,5-8双周'),[1,3,6,8]);assert.throws(()=>D.parseWeeks('1-4单双周'));assert.throws(()=>D.parseWeeks(''));
 const result=D.parseCourses('课程,星期,周次,开始,结束\n复习课,周一,"1-4单周,5-8双周",08:00,09:00',{school:'学校',firstMonday:'2026-10-19'});assert.equal(result.events.length,4);assert.equal(result.errors.length,0);
});
test('ICS respects precise UNTIL, long COUNT and the configured start of a recurrence week',()=>{
 const make=rule=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:复习课\nDTSTART:20261020T080000\nDTEND:20261020T090000\nRRULE:'+rule+'\nEND:VEVENT\nEND:VCALENDAR';
 assert.equal(D.parseCourses(make('FREQ=DAILY;UNTIL=20261022T073000')).events.length,2);
 assert.equal(D.parseCourses(make('FREQ=DAILY;COUNT=450')).events.length,450);
 assert.equal(D.parseCourses(make('FREQ=DAILY')).events.length,0);assert.match(D.parseCourses(make('FREQ=DAILY')).errors[0],/结束日期/);
 assert.deepEqual(D.parseCourses(make('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;WKST=SU;COUNT=4')).events.map(e=>e.date),['2026-10-20','2026-11-01','2026-11-03','2026-11-15']);
 assert.equal(D.parseCourses(make('FREQ=DAILY;COUNT=2').replace('END:VEVENT\nEND:VCALENDAR','')).errors.length,1);
});
