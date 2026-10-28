(function (global) {
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const weekday = d => new Date(d + 'T12:00:00Z').getUTCDay() || 7;
  const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  function normalizePlan(p) {
    if (!p || !['long', 'daily'].includes(p.kind) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 70 || !validDate(p.startDate) || (p.endDate && !validDate(p.endDate)) || (p.endDate && p.endDate < p.startDate) || (p.kind === 'long' && !p.endDate)) throw new Error('请填写计划名称和有效起止日期；长期计划需要截止日期。');
    const priority = Number(p.priority || 3);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new Error('优先级应为 P1–P5。');
    const days = [...new Set((p.weekdays || []).map(Number))].sort();
    if (p.kind === 'daily' && (!validTime(p.start) || !validTime(p.end) || p.end <= p.start || !days.length || days.some(x => !Number.isInteger(x) || x < 1 || x > 7))) throw new Error('每日计划需要有效时间和至少一个执行星期。');
    if (!Array.isArray(p.milestones || []) || (p.milestones || []).length > 30) throw new Error('阶段清单最多 30 项。');
    const milestones = (p.milestones || []).map(m => {
      if (!m || typeof m.title !== 'string' || !m.title.trim() || m.title.length > 100 || !validDate(m.due) || m.due < p.startDate || (p.endDate && m.due > p.endDate)) throw new Error('阶段目标需有名称，日期应位于计划起止日期之间。');
      return { id: String(m.id || 'm-' + hash(m.due + m.title)).slice(0, 100), title: m.title.trim(), due: m.due, done: !!m.done };
    });
    if (new Set(milestones.map(m => m.id)).size !== milestones.length) throw new Error('阶段清单存在重复项目，请合并后保存。');
    const tags = [...new Set((p.tags || []).map(x => String(x).trim().slice(0, 20)).filter(Boolean))].slice(0, 6);
    return { id: String(p.id || '').slice(0, 100), kind: p.kind, title: p.title.trim(), goal: String(p.goal || p.title).slice(0, 1000), startDate: p.startDate, endDate: p.endDate || '', start: p.kind === 'daily' ? p.start : '', end: p.kind === 'daily' ? p.end : '', weekdays: p.kind === 'daily' ? days : [], priority, tags, content: String(p.content || '').slice(0, 1000), state: ['active', 'paused', 'done'].includes(p.state) ? p.state : 'active', milestones, created: p.created || '', updated: p.updated || '' };
  }
  function routineEvents(rule, from, to, skipped = []) {
    if (rule.kind !== 'daily' || rule.state !== 'active' || !validDate(from) || !validDate(to)) return [];
    const start = from > rule.startDate ? from : rule.startDate, end = rule.endDate && rule.endDate < to ? rule.endDate : to, suppressed = new Set(skipped);
    if ((Date.parse(end) - Date.parse(start)) / 86400000 > 400) throw new Error('一次最多生成 400 天的每日计划。');
    const result = [];
    for (let date = start; date <= end; date = addDay(date, 1)) {
      if (!rule.weekdays.includes(weekday(date)) || suppressed.has(rule.id + '|' + date)) continue;
      result.push({ id: 'routine-' + rule.id + '-' + date, date, title: rule.title, start: rule.start, end: rule.end, priority: rule.priority, tags: rule.tags, content: rule.content || rule.goal, source: 'daily', routineId: rule.id, planId: '', state: 'todo', created: rule.created, updated: rule.updated, routineModified: false });
    }
    return result;
  }
  function csvRows(text) {
    const rows = []; let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i <= text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else if (c === undefined) throw new Error('CSV 引号未闭合。'); else field += c; }
      else if (c === '"' && !field) quoted = true;
      else if (c === ',' || c === '\n' || c === undefined) { row.push(field.trim()); field = ''; if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; } }
      else if (c !== '\r') field += c;
      if (rows.length > 5000) throw new Error('课表最多支持 5000 行，请分学期导入。');
    }
    return rows;
  }
  function courseDate(value) { const m = String(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : value; }
  function courseTime(value) { const m = String(value).match(/^(\d{1,2})[:：](\d{2})(?::00)?$/); return m ? m[1].padStart(2, '0') + ':' + m[2] : value; }
  function parseWeeks(value) {
    if(/单/.test(value)&&/双/.test(value)){const parts=String(value).split(/[,，、;；]/).filter(Boolean);if(parts.length<2||parts.some(p=>/单/.test(p)&&/双/.test(p)))throw new Error('同一段周次不能同时为单周和双周。');return [...new Set(parts.flatMap(parseWeeks))].sort((a,b)=>a-b);}
    const odd = /单/.test(value), even = /双/.test(value), text = String(value).replace(/周次|第|周|[()（）单双\s]/g, ''), result = [];
    for (const part of text.split(/[,，、;；]/).filter(Boolean)) {
      const m = part.match(/^(\d{1,2})(?:[-~—至](\d{1,2}))?$/); if (!m) throw new Error('周次格式应为 1-16 或 1,3,5，可附加单周/双周。');
      const a = +m[1], b = +(m[2] || m[1]); if (a < 1 || b > 60 || b < a) throw new Error('教学周需在 1–60 之间。');
      for (let n = a; n <= b; n++) if ((!odd || n % 2 === 1) && (!even || n % 2 === 0)) result.push(n);
    }
    if(!result.length)throw new Error('周次不能为空。');return [...new Set(result)];
  }
  function parseCSV(text, options) {
    const rows = csvRows(text), header = rows.shift() || [], errors = [], events = [];
    const col = (...names) => header.findIndex(s => names.includes(s.trim().toLowerCase()));
    const columns = { title: col('课程', '课程名称', '名称', '任务名称', 'title', 'summary'), date: col('日期', 'date'), start: col('开始', '开始时间', 'start'), end: col('结束', '结束时间', 'end'), room: col('教室', '地点', 'room', 'location'), teacher: col('教师', '老师', 'teacher'), day: col('星期', '星期几', 'day', 'weekday'), weeks: col('周次', 'weeks') };
    if (columns.title < 0 || columns.start < 0 || columns.end < 0 || (columns.date < 0 && (columns.day < 0 || columns.weeks < 0))) throw new Error('CSV 需要“课程,日期,开始,结束”列；或“课程,星期,周次,开始,结束”列。');
    rows.forEach((row, index) => {
      try {
        const get = key => columns[key] < 0 ? '' : row[columns[key]] || '', title = get('title'), start = courseTime(get('start')), end = courseTime(get('end'));
        if (!title || !validTime(start) || !validTime(end) || end <= start) throw new Error('课程名称或起止时间无效');
        let dates;
        if (get('date')) { const date = courseDate(get('date')); if (!validDate(date)) throw new Error('日期无效'); dates = [date]; }
        else {
          if (!validDate(options.firstMonday) || weekday(options.firstMonday) !== 1) throw new Error('请设置第 1 教学周周一');
          const value = get('day').replace(/星期|周|礼拜/g, ''), day = /^[1-7]$/.test(value) ? +value : value.length === 1 ? '一二三四五六日'.indexOf(value === '天' ? '日' : value) + 1 : 0;
          if (day < 1 || day > 7) throw new Error('星期无效');
          dates = parseWeeks(get('weeks')).map(w => addDay(options.firstMonday, (w - 1) * 7 + day - 1));
          if (!dates.length) throw new Error('没有有效周次');
        }
        for (const date of dates) events.push({ title, date, start, end, room: get('room'), teacher: get('teacher') });
      } catch (error) { errors.push(`第 ${index + 2} 行：${error.message}`); }
    });
    return { events, errors };
  }
  function icsTime(raw, property) {
    if (/VALUE=DATE(?:;|$)/i.test(property)) throw new Error('全天课程没有明确时间，请先补充起止时刻');
    const zone = property.match(/TZID=([^;:]+)/i)?.[1];
    if (zone && !['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Hong_Kong', 'UTC', 'Etc/UTC'].includes(zone)) throw new Error('暂不支持此时区：' + zone);
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!m) throw new Error('课程日期时间格式无效');
    let date = `${m[1]}-${m[2]}-${m[3]}`, time = `${m[4]}:${m[5]}`;
    if (!validDate(date) || !validTime(time)) throw new Error('课程日期时间无效');
    if (m[7] || ['UTC', 'Etc/UTC'].includes(zone)) {
      const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 8, +m[5])); date = dt.toISOString().slice(0, 10); time = dt.toISOString().slice(11, 16);
    }
    return { date, time };
  }
  const unescapeICS = value => value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
  function parseICS(text) {
    const events = [], errors = [], lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); let item = null, number = 0;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { item = {}; number++; continue; }
      if (line !== 'END:VEVENT') {
        if (!item) continue; const i = line.indexOf(':'); if (i < 0) continue;
        const property = line.slice(0, i), name = property.split(';')[0], entry = { property, value: line.slice(i + 1) }; (item[name] ||= []).push(entry); continue;
      }
      try {
        if (!item || !item.DTSTART || !item.DTEND || !item.SUMMARY) throw new Error('缺少课程名称或起止时间');
        if (item.STATUS?.[0]?.value === 'CANCELLED') { item = null; continue; }
        const start = icsTime(item.DTSTART[0].value, item.DTSTART[0].property), end = icsTime(item.DTEND[0].value, item.DTEND[0].property);
        if (end.date !== start.date || end.time <= start.time) throw new Error('暂不支持跨天课程，请分成当天时段');
        let dates = [start.date];
        const rule = item.RRULE?.[0]?.value;
        if (rule) {
          const r = Object.fromEntries(rule.split(';').map(s => s.split('=')));
          if (!['WEEKLY', 'DAILY'].includes(r.FREQ) || Object.keys(r).some(k => !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'].includes(k))) throw new Error('暂只支持按日/周重复；请导出具体日期的 CSV');
          if(!r.COUNT&&!r.UNTIL)throw new Error('重复课程需要结束日期或重复次数，请按学期导出');
          const interval = Number(r.INTERVAL || 1), count = r.COUNT ? Number(r.COUNT) : 2000;
          if (!Number.isInteger(interval) || interval < 1 || !Number.isInteger(count) || count < 1 || count > 2000) throw new Error('重复次数或间隔无效');
          if (r.BYDAY && r.FREQ === 'DAILY') throw new Error('按日重复附带星期限制暂不支持，请使用按周重复');
          const map = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }, days = r.BYDAY ? r.BYDAY.split(',').map(s => map[s]) : [weekday(start.date)];
          if (days.some(x => !x)) throw new Error('重复星期格式不支持');
          if(r.WKST&&!map[r.WKST])throw new Error('重复周起始星期无效');
          const untilStamp=r.UNTIL&&r.UNTIL.length!==8?icsTime(r.UNTIL,item.DTSTART[0].property):null;
          const until = r.UNTIL ? r.UNTIL.length === 8 ? `${r.UNTIL.slice(0,4)}-${r.UNTIL.slice(4,6)}-${r.UNTIL.slice(6,8)}` : untilStamp.date : addDay(start.date, 730);
          if (!validDate(until) || until > addDay(start.date, 730)) throw new Error('重复课表请限制在两年以内');
          const monday = addDay(start.date,-((weekday(start.date)-(map[r.WKST]||1)+7)%7)); dates = [];
          for (let d = start.date, n = 0; d <= until && dates.length < count; d = addDay(d, 1), n++) {
            const weeks = Math.floor((Date.parse(d) - Date.parse(monday)) / 604800000);
            if(d===until&&untilStamp&&start.time>untilStamp.time)break;
            if (r.FREQ === 'DAILY' ? n % interval === 0 : weeks % interval === 0 && days.includes(weekday(d))) dates.push(d);
          }
          if(r.COUNT&&!r.UNTIL&&dates.length<count)throw new Error('重复课程范围超过两年，请分学期导入');
        }
        for (const r of item.RDATE || []) for (const value of r.value.split(',')) { const x = icsTime(value, r.property); if (x.time !== start.time) throw new Error('附加日期的开始时间不同，请使用 CSV'); dates.push(x.date); }
        const excluded = new Set((item.EXDATE || []).flatMap(r => r.value.split(',').map(value => icsTime(value, r.property).date)));
        for (const date of [...new Set(dates)].sort()) if (!excluded.has(date)) events.push({ title: unescapeICS(item.SUMMARY[0].value), date, start: start.time, end: end.time, room: unescapeICS(item.LOCATION?.[0]?.value || ''), teacher: '', content: unescapeICS(item.DESCRIPTION?.[0]?.value || ''), externalId: item.UID?.[0]?.value || '' });
      } catch (error) { errors.push(`第 ${number} 项：${error.message}`); }
      item = null;
    }
    if(item)errors.push('最后一项课程未正常结束，请检查 ICS 文件是否完整。');return { events, errors };
  }
  function parseCourses(text, options = {}) {
    if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('请选择 2MB 以内的课表文件。');
    const parsed = /^\s*BEGIN:VCALENDAR/im.test(text) ? parseICS(text) : parseCSV(text, options);
    const school = String(options.school || '东南大学').trim().slice(0, 80);
    if (parsed.events.length > 2000) throw new Error('超过 2000 次课程，请分学期导入。');
    const unique = new Map();
    for (const e of parsed.events) {
      const id = 'course-' + hash([school, e.externalId || e.title, e.date, e.start].join('|'));
      unique.set(id, { ...e, id, sourceId: id, school, source: 'course-import', priority: 3, state: 'todo', locked: true, tags: ['学习', '课程'], content: e.content || `${e.title}${e.room ? ' · ' + e.room : ''}${e.teacher ? ' · ' + e.teacher : ''}` });
    }
    return { events: [...unique.values()], errors: parsed.errors, duplicates: parsed.events.length - unique.size, school };
  }
  const isCourse=e=>e?.source==='course-import';
  function courseEditScope(text,context={}){
    const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,''),raw=normalize(text),parts=raw.split(/[，。；;,\n]|其他/),negative=/(?:不要|不用|不需要|无需|不必|别|不许).{0,8}(?:改|动|调|移|删|取消)|不改动|不改|不动|保持(?:原样|不变|原时间)/;
    const request=parts.filter(p=>!negative.test(p)).join('，'),change=/(?:调课|改期|改到|改成|改为|挪|移到|换到|提前|推迟|延后|取消|删除|停课|修改|调整)/.test(request),items=new Map();
    for(const e of [...(context.events||[]),...(context.protectedDrafts||[]).map(d=>d.event),...(context.drafts||[]).map(d=>d.event)])if(isCourse(e)&&e.id)items.set(e.id,e);
    if(!change)return {editableIds:[],allowDelete:false,truncated:false};
    const source=request.split(/改到|改成|改为|挪到|移到|换到|推迟到|提前到|延后到|调整到/)[0],selected=validDate(context.selectedDate)?context.selectedDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),now=Number.isFinite(Date.parse(context.now))?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(context.now)):selected;
    const dates=new Set((source.match(/\d{4}-\d{2}-\d{2}/g)||[]).filter(validDate)),monthDays=[...source.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/g)];
    for(const m of monthDays)for(const e of items.values())if(e.date?.slice(5)===m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')&&(!m[1]||e.date.startsWith(m[1]+'-')))dates.add(e.date);
    for(const [word,offset] of [['今天',0],['明天',1],['后天',2]])if(source.includes(word))dates.add(addDay(now,offset));
    const week=source.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);if(week){const day='一二三四五六日'.indexOf(week[2]==='天'?'日':week[2])+1;dates.add(addDay(selected,1-weekday(selected)+(week[1]==='下周'?7:0)+day-1));}
    let candidates=[...items.values()].filter(e=>{const title=normalize(e.title);return title&&(request.includes(title)||request.includes(e.id))&&!parts.some(p=>negative.test(p)&&p.includes(title))&&!new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:的)?(?:复习|学习|作业|练习|预习)').test(request);});
    if(!candidates.length&&/^(?:请|帮我|把|再)*(?:它|这门课|这节课|这个事件|这个任务|改到|改成|改为|调整到)/.test(request)&&items.has(context.focusedEventId))candidates=[items.get(context.focusedEventId)];
    if(dates.size)candidates=candidates.filter(e=>dates.has(e.date));
    else if(!candidates.some(e=>{const title=normalize(e.title),at=source.indexOf(title);return /(?:每周|整学期|整个学期|所有|全部)(?:的)?$/.test(source.slice(Math.max(0,at-8),at));})){const days=[...new Set(candidates.map(e=>e.date).filter(validDate))].sort(),chosen=days.find(d=>d===selected)||days.find(d=>d>=selected);candidates=candidates.filter(e=>e.date===chosen);}
    return {editableIds:candidates.slice(0,30).map(e=>e.id),allowDelete:/(?:取消|删除|停课)/.test(request),truncated:candidates.length>30};
  }
  function cleanConfirmedCourseDrafts(drafts,events,confirmed,applied){
    if(!confirmed)return drafts;const saved=new Map(events.map(e=>[e.id,e])),fields=['date','title','start','end','priority','tags','content','state','planId'];
    return drafts.flatMap(d=>{const old=saved.get(d.event?.id);if(!isCourse(old))return [d];if(applied||fields.every(k=>JSON.stringify(d.event[k]??'')===JSON.stringify(old[k]??'')))return [];if(!d.before&&!d.manual?.length)return [];return [{...d,before:d.before||JSON.parse(JSON.stringify(old)),action:d.action==='delete'?'delete':'update',...(!d.courseAuthorized&&!d.manual?.length?{selected:false,assumption:'旧版遗留的课程建议已取消勾选；请重新指定调课要求，或手动核对后再勾选。'}:{})}];});
  }
  const api = { validDate, validTime, addDay, weekday, hash, normalizePlan, routineEvents, parseCourses, parseWeeks, isCourse, courseEditScope, cleanConfirmedCourseDrafts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.FocusDomain = api;
})(typeof window === 'undefined' ? globalThis : window);
