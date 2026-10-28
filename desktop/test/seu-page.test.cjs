const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSchoolCourses}=require('../seu-page.cjs');
const term={DM:'2026-2027-3',MC:'2026-2027学年秋季学期'};
async function read(batches){const urls=[];const result=await vm.runInNewContext('('+readSchoolCourses.toString()+')('+JSON.stringify(term.DM)+')',{AbortSignal,fetch:async url=>{urls.push(url);const body=url.includes('xnxqcx')?{datas:{xnxqcx:{rows:[term]}}}:{datas:{xskcb:batches.shift()}};return {ok:true,json:async()=>body};}});return {result,urls};}
test('semester reader follows pagination instead of silently keeping only the first school page',async()=>{
 const {result,urls}=await read([{rows:[{KCM:'课程一',XNXQDM:term.DM}],totalSize:2},{rows:[{KCM:'课程二',XNXQDM:term.DM}],totalSize:2}]);
 assert.equal(result.rows.length,2);assert.equal(result.termName,term.MC);assert.ok(urls.at(-1).includes('pageNumber=2'));assert.ok(urls[1].includes('XNXQDM=2026-2027-3'));
});
test('semester reader rejects repeated, missing or inconsistent school pages and wrong-term rows',async()=>{
 const same={rows:[{KCM:'重复课程'}],totalSize:2};
 for(const [batches,pattern] of [[[same,same],/重复/],[[same,{rows:[],totalSize:2}],/不完整/],[[{rows:[{KCM:'暑期课程',XNXQDM:'2026-2027-1'}],totalSize:1}],/不一致/]]){const {result}=await read(batches);assert.match(result.error,pattern);assert.equal(result.rows,undefined);}
});
