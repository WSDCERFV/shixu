const fs=require('node:fs'),path=require('node:path');
const folder=path.join(__dirname,'skills/shixu-planner');
function instructions(context={}){
  const source=fs.readFileSync(path.join(folder,'SKILL.md'),'utf8');
  if(!source.startsWith('---\n')&&!source.startsWith('---\r\n'))throw new Error('内置规划技能损坏，请重新安装应用。');
  let text=source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
  if(context.draftMode==='course-import')text+='\n\n'+fs.readFileSync(path.join(folder,'references/course-import.md'),'utf8');
  return text;
}
const contract=`仅返回 JSON 对象，字段 reply、tasks、plans 都必须存在。reply 为中文简短回答。tasks 每项字段 action(add/update/delete)、id(新增留空，修改/删除复用原 id)、title、date(YYYY-MM-DD)、start/end(HH:MM)、priority(1最高至5最低)、tags(最多6项)、content(15到1000字，填写具体步骤和完成标准)、assumption(明确假设)、planId(无则空)、schedule:{flexible:boolean,earliest:HH:MM,latest:HH:MM}。fixed 时 earliest=start、latest=end；flexible 的窗口必须来自用户要求或明确说明的合理假设。每轮最多30项任务、8项计划。plans 每项 id(新建用临时唯一id)、kind(long/daily)、title、goal、startDate、endDate、start、end、weekdays、priority、tags、content、state(active/paused/done)、milestones；长期需截止日，start/end为空、weekdays为空；每日需起止时间、执行星期(1周一到7周日)，结束日可空，milestones为空。阶段项 id/title/due/done，due须在计划期间，新阶段done=false。plans 也带 schedule，daily含义同任务，long用{flexible:false,earliest:'',latest:''}。tasks 的 planId 可关联本轮或已有计划。不要输出 Markdown 代码围栏、工具调用、感受或凭空编造的已完成状态。`;
module.exports={instructions,contract,info:{name:'shixu-planner',version:'1.1'}};
