const fs=require('node:fs/promises');
const path=require('node:path');
const D=require('./planner-domain.cjs');
const W=require('./workspace-layout.cjs');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function validateWorkspace(value){
 const s=value?.privateContent;if(!object(s)||s.v!==3||!Array.isArray(s.e))throw new Error('工作区记录格式无效。');
 const ids=new Set();for(const e of s.e){
  if(!Array.isArray(e)||typeof e[0]!=='string'||!e[0]||ids.has(e[0])||typeof e[2]!=='string'||!e[2].trim()||!D.validDate(e[1])||!D.validTime(e[3])||!D.validTime(e[4])||e[4]<=e[3]||(e[7]!==undefined&&(!Array.isArray(e[7])||e[7].some(t=>typeof t!=='string'))))throw new Error('任务记录损坏或编号重复。');if(e[27]!==undefined&&typeof e[27]!=='boolean')throw new Error('课程并行安排设置无效。');ids.add(e[0]);
 }
 if(!object(s.p))throw new Error('偏好设置格式无效。');
 if(s.p.appMode!==undefined&&!['normal','minimal'].includes(s.p.appMode))throw new Error('应用模式设置无效。');
 if(s.p.weekDisplay!==undefined&&!['scroll','fit'].includes(s.p.weekDisplay))throw new Error('周计划显示方式无效。');
 if(s.p.features!==undefined&&(!object(s.p.features)||Object.values(s.p.features).some(v=>typeof v!=='boolean')))throw new Error('功能开关格式无效。');
 if(s.p.dashboardLayouts!==undefined){if(!object(s.p.dashboardLayouts))throw new Error('总览布局格式无效。');for(const mode of ['normal','minimal']){const items=s.p.dashboardLayouts[mode];if(items===undefined||items===null)continue;if(!Array.isArray(items)||items.length>Object.keys(W.modules).length)throw new Error('总览模块列表无效。');const seen=new Set();for(const item of items){const spec=W.modules[item?.id];if(!spec||seen.has(item.id)||!['x','y','w','h'].every(k=>Number.isInteger(item[k]))||item.x<0||item.y<0||item.y>456||item.w<spec.minW||item.x+item.w>12||item.h<spec.minH||item.h>24)throw new Error('总览模块位置或尺寸无效。');seen.add(item.id);}for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(W.overlap(items[i],items[j]))throw new Error('总览模块存在重叠。');}}
 for(const [key,min,max] of [['zoom',75,150],['calendarHeight',260,650],['detailWidth',240,380],['todayShare',20,55],['navWidth',104,280],['focusMinutes',1,180],['shortMinutes',1,60],['longMinutes',1,90],['panelOpacity',45,100],['calendarZoom',80,180]])if(s.p[key]!==undefined&&(!Number.isFinite(Number(s.p[key]))||Number(s.p[key])<min||Number(s.p[key])>max))throw new Error('偏好数值无效：'+key);
 if((s.p.start!==undefined&&!D.validTime(s.p.start))||(s.p.end!==undefined&&!D.validTime(s.p.end))||(s.p.start&&s.p.end&&s.p.end<=s.p.start))throw new Error('时间轴设置无效。');
 if(s.selectedDate&&!D.validDate(s.selectedDate)||s.anchor&&!D.validDate(s.anchor))throw new Error('日程日期无效。');
 for(const key of ['providers','sessions','goalPlans','routineSkips','courseCaches'])if(s[key]!==undefined&&!Array.isArray(s[key]))throw new Error('记录列表格式无效：'+key);
 for(const item of s.sessions||[])if(!object(item)||!D.validDate(item.date)||!Number.isFinite(item.minutes)||item.minutes<0)throw new Error('专注历史格式无效。');
 if(s.reminders&&(!object(s.reminders)||!Array.isArray(s.reminders.seen)||s.reminders.seen.some(k=>typeof k!=='string')))throw new Error('提醒记录格式无效。');
 if((s.routineSkips||[]).some(k=>typeof k!=='string'))throw new Error('重复任务例外格式无效。');
 const planIds=new Set();for(const p of s.goalPlans||[]){D.normalizePlan(p);if(!p.id||planIds.has(p.id))throw new Error('计划编号无效或重复。');planIds.add(p.id);}
 const providerIds=new Set();for(const p of s.providers||[]){if(!object(p)||typeof p.id!=='string'||providerIds.has(p.id)||typeof p.name!=='string'||typeof p.url!=='string')throw new Error('供应商配置格式无效。');providerIds.add(p.id);}
 if(s.timer&&(!object(s.timer)||!['focus','short','long'].includes(s.timer.mode)||!Number.isFinite(s.timer.remaining)||s.timer.remaining<0||!Number.isFinite(s.timer.total)||s.timer.total<=0||!Number.isFinite(s.timer.deadline)||s.timer.deadline<0))throw new Error('计时记录格式无效。');
 if(s.chats){if(!object(s.chats)||!Array.isArray(s.chats.sessions))throw new Error('对话记录格式无效。');for(const c of s.chats.sessions){if(!object(c)||typeof c.id!=='string'||typeof c.title!=='string'||!Array.isArray(c.messages)||c.messages.some(m=>!object(m)||typeof m.text!=='string')||!Number.isFinite(Date.parse(c.updated)))throw new Error('对话记录缺少必要信息。');for(const key of ['conversation','drafts','planDrafts','acceptedIds'])if(c[key]!==undefined&&!Array.isArray(c[key]))throw new Error('对话草案列表格式无效。');for(const d of c.drafts||[])if(!object(d)||!object(d.event)||!Array.isArray(d.event.tags)||!Array.isArray(d.manual))throw new Error('任务草案格式无效。');for(const d of c.planDrafts||[])if(!object(d)||!object(d.plan)||!Array.isArray(d.plan.milestones)||!Array.isArray(d.plan.tags)||!Array.isArray(d.plan.weekdays))throw new Error('计划草案格式无效。');}}
 if(s.editorDrafts){if(!object(s.editorDrafts)||!Array.isArray(s.editorDrafts.tasks)||!Array.isArray(s.editorDrafts.plans))throw new Error('详情草稿格式无效。');for(const item of [...s.editorDrafts.tasks,...s.editorDrafts.plans])if(!Array.isArray(item)||typeof item[0]!=='string'||!object(item[1]))throw new Error('详情草稿条目无效。');if(s.editorDrafts.newTask&&(!object(s.editorDrafts.newTask)||!Array.isArray(s.editorDrafts.newTask.tags)))throw new Error('新任务草稿格式无效。');}
 if(s.focusLedger&&(!object(s.focusLedger)||!object(s.focusLedger.days)||!object(s.focusLedger.modeCounts)||!Array.isArray(s.focusLedger.seen)||!Number.isFinite(s.focusLedger.totalFocusMinutes)))throw new Error('专注统计格式无效。');
 return value;
}
function validateRecord(name,value){
 if(name==='workspace.json')return validateWorkspace(value);
 if(name==='mail-log.json'){if(!Array.isArray(value))throw new Error('邮件日志格式无效。');}
 else if(!object(value))throw new Error('本地配置格式无效。');
 if(name==='secrets.json'&&Object.values(value).some(x=>typeof x!=='string'))throw new Error('加密配置格式无效。');
 return value;
}
function createLocalStore(directory){
 let queue=Promise.resolve();const recovered=[];
 const location=name=>{if(!/^[\w-]+\.json$/.test(name))throw new Error('本地文件名无效。');return path.join(directory,name);};
 async function atomic(target,text){
  const temporary=target+'.tmp';let file;
  try{file=await fs.open(temporary,'w',0o600);await file.writeFile(text,'utf8');await file.sync();await file.close();file=null;await fs.rename(temporary,target);}
  catch(error){if(file)await file.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw error;}
 }
 function write(name,data){
  let text;try{validateRecord(name,data);text=JSON.stringify(data);}catch(error){return Promise.reject(error);}
  const operation=queue.then(async()=>{
   await fs.mkdir(directory,{recursive:true});const target=location(name);let prior;
   try{prior=await fs.readFile(target,'utf8');try{validateRecord(name,JSON.parse(prior));}catch{prior=null;}}
   catch(error){if(error.code!=='ENOENT')throw error;}
   if(prior!==undefined&&prior!==null)await atomic(target+'.bak',prior);
   await atomic(target,text);
  });queue=operation.catch(()=>{});return operation;
 }
 async function read(name,fallback){
  const target=location(name);let error;
  try{return validateRecord(name,JSON.parse(await fs.readFile(target,'utf8')));}catch(e){error=e;}
  let backup;try{backup=validateRecord(name,JSON.parse(await fs.readFile(target+'.bak','utf8')));}catch(e){if(error.code==='ENOENT'&&e.code==='ENOENT')return fallback;throw error;}
  await fs.mkdir(directory,{recursive:true});if(error.code!=='ENOENT')await fs.copyFile(target,target+'.corrupt-'+Date.now()+'-'+Math.random().toString(36).slice(2,6));
  await atomic(target,JSON.stringify(backup));recovered.push(name);return backup;
 }
 return {read,write,flush:()=>queue,recovered};
}
module.exports={createLocalStore,validateWorkspace};
