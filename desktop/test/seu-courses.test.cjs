const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseSeuCourses}=require('../seu-courses.cjs');
test('SEU rows expand by semester Monday, official periods and odd/even weeks with stable IDs',()=>{
 const payload={termCode:'2026-2027-1',termName:'秋季学期',rows:[{KCM:'高等数学',KCH:'MATH',SKXQ:'2',KSJC:'1',JSJC:'2',ZCMC:'1-5周(单)',SKJS:'教师',JASMC:'J101'}]};
 const a=parseSeuCourses(payload,{firstMonday:'2026-09-21',excludeEnded:false}),b=parseSeuCourses(payload,{firstMonday:'2026-09-21',excludeEnded:false});
 assert.deepEqual(a.events.map(e=>e.date),['2026-09-22','2026-10-06','2026-10-20']);assert.equal(a.events[0].start,'08:00');assert.equal(a.events[0].end,'09:35');assert.equal(a.events[0].school,'东南大学');assert.equal(a.events[0].teachingWeek,1);assert.deepEqual(a.events.map(e=>e.id),b.events.map(e=>e.id));
 const mixed=parseSeuCourses({...payload,rows:[{...payload.rows[0],ZCMC:'1-3周(单),6-8周(双)'}]},{firstMonday:'2026-09-21',excludeEnded:false});assert.deepEqual(mixed.events.map(e=>e.teachingWeek),[1,3,6,8]);
});
test('whole semester expands with an automatic calendar origin and excludes ended sessions in Shanghai',()=>{
 const data={termCode:'2026-2027-1',rows:[{KCM:'整学期课',SKXQ:2,KSJC:1,JSJC:2,ZCMC:'1-16周'}]};
 const a=parseSeuCourses(data,{now:'2026-10-06T09:00:00+08:00'});assert.equal(a.firstMonday,'2026-09-21');assert.equal(a.totalCount,16);assert.equal(a.skippedPast,2);assert.equal(a.events[0].date,'2026-10-06');
 const b=parseSeuCourses(data,{now:'2026-10-06T09:35:00+08:00'});assert.equal(b.skippedPast,3);assert.equal(b.events[0].date,'2026-10-13');assert.equal(b.events.at(-1).date,'2027-01-05');
});
test('SEU import rejects a wrong semester origin and reports unrecognized rows instead of inventing times',()=>{
 assert.throws(()=>parseSeuCourses({rows:[]},{firstMonday:'2026-09-22'}),/周一/);
 const result=parseSeuCourses({rows:[{KCM:'未知课',SKXQ:1,KSJC:15,JSJC:16,ZCMC:'1-16周'}]},{firstMonday:'2026-09-21'});assert.equal(result.events.length,0);assert.equal(result.errors.length,1);
});
