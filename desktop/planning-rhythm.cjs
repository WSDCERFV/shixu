const D=require('./planner-domain.cjs');
const defaults=[
 {id:'breakfast',title:'早餐',start:'07:00',end:'07:30'},
 {id:'lunch',title:'午餐',start:'12:00',end:'13:00'},
 {id:'nap',title:'午休',start:'13:00',end:'13:30'},
 {id:'dinner',title:'晚餐',start:'18:00',end:'18:45'},
 {id:'sleep',title:'夜间睡眠',start:'23:30',end:'06:30'}
];
const minute=s=>Number(s.slice(0,2))*60+Number(s.slice(3)),clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const names={早餐:'breakfast',早饭:'breakfast',午餐:'lunch',午饭:'lunch',午休:'nap',午睡:'nap',晚餐:'dinner',晚饭:'dinner',睡觉:'sleep',睡眠:'sleep'};
function policy(messages=[],today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(Date.now())){
 const result={windows:defaults.map(x=>({...x})),overrides:[],travelMinutes:15,assumption:'未指定作息时预留早餐 07:00–07:30、午餐 12:00–13:00、午休 13:00–13:30、晚餐 18:00–18:45、夜间睡眠 23:30–06:30，下课后留 15 分钟出行。用户明确作息优先；不新增占位任务、不移动已有课程。'};
 for(const [index,text] of messages.entries()){
  // Only explicit user sentences set a rest window; model output cannot waive it.
  for(const clause of String(text).split(/[，。；\n]/)){
   const match=clause.match(/(早餐|早饭|午餐|午饭|午休|午睡|晚餐|晚饭|睡眠|睡觉)(?:时间)?\s*(?:改为|改成|改到|设为|安排在|定在|是|为)?\s*(\d{1,2})[:：.](\d{2})\s*(?:到|至|[-—–~～])\s*(\d{1,2})[:：.](\d{2})/);
   const skip=clause.match(/^\s*(?:(?:今天|明天|本次|这次|每天)\s*)?(?:取消|跳过|不需要|不用)(午休|午睡)\s*$/);
   if(!match&&!skip)continue;if(/今天|明天/.test(clause)&&index!==messages.length-1)continue;if(/(?:不要|不能|别|不想|并非|不是).{0,6}(?:改|设|取消|跳过)/.test(clause))continue;
   const date=clause.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||(clause.includes('明天')?D.addDay(today,1):clause.includes('今天')?today:'');if(date&&!D.validDate(date))continue;
   if(skip){result.overrides.push({id:names[skip[1]],date,disabled:true});continue;}
   const start=match[2].padStart(2,'0')+':'+match[3],end=match[4].padStart(2,'0')+':'+match[5],id=names[match[1]];if(!D.validTime(start)||!D.validTime(end)||start===end||(id!=='sleep'&&end<start))continue;
   result.overrides.push({id,date,start,end,disabled:false});
  }
  const travel=String(text).match(/(?:下课|出行|通勤)(?:后)?(?:预留|留出|缓冲|时间)(?:为|改为|改成)?\s*(\d{1,2})\s*分钟/);if(travel&&Number(travel[1])>=5&&Number(travel[1])<=90)result.travelMinutes=Number(travel[1]);
 }
 return result;
}
function reservations(context,dates,events){
 const instant=Date.parse(context.now),rules=context.rhythm||policy([context.requestText||''],new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(Number.isFinite(instant)?instant:Date.now())),result=[];
 const add=(date,id,title,start,end)=>{if(start<end)result.push({id:'__rhythm__'+date+'-'+id,date,title,start,end,source:'rhythm-reserve'});};
 for(const date of dates){for(const item of rules.windows){let rule={...item};for(const change of rules.overrides)if(change.id===item.id&&(!change.date||change.date===date))rule={...rule,...change};if(rule.disabled)continue;if(rule.end>rule.start)add(date,rule.id,rule.title+'预留',rule.start,rule.end);else{add(date,rule.id+'-morning',rule.title+'预留','00:00',rule.end);add(date,rule.id+'-night',rule.title+'预留',rule.start,'23:59');}}}
 const allowedDates=new Set(dates);for(const e of events)if(D.isCourse(e)&&allowedDates.has(e.date)){const end=Math.min(1439,minute(e.end)+rules.travelMinutes);add(e.date,'travel-'+e.id,'下课出行缓冲：'+e.title,e.end,clock(end));}
 return result;
}
module.exports={policy,reservations};
