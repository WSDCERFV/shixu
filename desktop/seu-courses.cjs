const D = require('./planner-domain.cjs');
// Source for period times: SEU Academic Affairs, effective autumn 2024.
const periods = ['08:00-08:45','08:50-09:35','09:50-10:35','10:40-11:25','11:30-12:15','14:00-14:45','14:50-15:35','15:50-16:35','16:40-17:25','17:30-18:15','19:00-19:45','19:50-20:35','20:40-21:25'];
// SEU 2026–2027 official academic calendar. Other terms require a calendar override.
const semesterMondays={'2026-2027-1':'2026-09-21','2026-2027-2':'2027-02-22'};
function parseSeuCourses(payload, options) {
  options={...options,firstMonday:options.firstMonday||semesterMondays[payload.termCode]};
  if (!D.validDate(options.firstMonday) || D.weekday(options.firstMonday) !== 1) throw new Error('请选择第 1 教学周的周一，按学校校历核对。');
  if (!Array.isArray(payload.rows) || payload.rows.length > 2000) throw new Error('学校返回的课表格式不正确。');
  const events = [], errors = [], stamp = new Date().toISOString();
  for (const [i, row] of payload.rows.entries()) {
    try {
      const title = String(row.KCM || '').trim(), day = Number(row.SKXQ), a = Number(row.KSJC), b = Number(row.JSJC), weeks = [...new Set(String(row.ZCMC || '').split(/[,，、;；]/).flatMap(part=>D.parseWeeks(part)))];
      if (!title || day < 1 || day > 7 || !Number.isInteger(day) || !periods[a-1] || !periods[b-1] || b < a || !weeks.length) throw new Error('课程名称、星期、周次或节次无法识别');
      for (const week of weeks) {
        const date = D.addDay(options.firstMonday, (week-1)*7+day-1), start = periods[a-1].split('-')[0], end = periods[b-1].split('-')[1];
        events.push({id:'seu-'+D.hash([payload.termCode,title,row.KCH||'',row.JXBID||'',date,start,end,row.JASMC||''].join('|')),date,title,start,end,priority:3,state:'todo',tags:['课程'],content:[row.SKJS?'教师：'+row.SKJS:'',row.JASMC?'教室：'+row.JASMC:'',`第 ${week} 教学周 · 第 ${a}–${b} 节`,payload.termName||payload.termCode].filter(Boolean).join('\n'),room:String(row.JASMC||''),teacher:String(row.SKJS||''),teachingWeek:week,school:'东南大学',source:'course-import',sourceId:String(payload.termCode||''),created:stamp,updated:stamp});
        if (events.length > 2000) throw new Error('课程次数超过 2000，请分学期抓取。');
      }
    } catch (e) { errors.push(`第 ${i+1} 条：${e.message}`); }
  }
  if (events.length > 2000) throw new Error('课程次数超过 2000，请分学期抓取。');
  const all=[...new Map(events.map(e=>[e.id,e])).values()],cutoff=options.now===undefined?Date.now():new Date(options.now).getTime();
  const upcoming=options.excludeEnded===false?all:all.filter(e=>Date.parse(e.date+'T'+e.end+':00+08:00')>cutoff);
  return {school:'东南大学',termCode:payload.termCode,termName:payload.termName,firstMonday:options.firstMonday,events:upcoming,totalCount:all.length,skippedPast:all.length-upcoming.length,errors};
}
module.exports = {parseSeuCourses,periods,semesterMondays};
