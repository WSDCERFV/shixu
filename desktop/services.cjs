const nodemailer = require('nodemailer');
const { requestAI, replyPrefix } = require('./ai-stream.cjs');
const skill = require('./planning-skill.cjs');
const engine = require('./planning-engine.cjs');
const { normalizePlan } = require('./planner-domain.cjs');

function endpoint(base, suffix) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含账号、密码或查询参数。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('请使用 HTTPS 服务地址；本机调试可使用 HTTP。');
  url.pathname = url.pathname.replace(/\/$/, '').replace(/\/(responses|chat\/completions|audio\/transcriptions)$/, '') + '/' + suffix;
  return url.toString();
}
async function request(url, options) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(90000) }); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? '服务响应超时，请稍后再试。' : '连接服务失败，请检查地址与网络。'); }
  if (!response.ok) throw new Error(`服务返回 ${response.status}。请检查密钥、模型、余额和服务协议。`);
  let text='';
  try{const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error('服务返回内容过大。');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
  catch(error){throw new Error(error.message==='服务返回内容过大。'?error.message:error.name==='TimeoutError'||error.name==='AbortError'?'服务响应超时，请稍后再试。':'服务响应中断，请检查网络后重试。');}
  let data;try{data=JSON.parse(text);}catch{throw new Error('服务未返回有效 JSON。');}if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('服务响应格式无效，请检查协议或稍后重试。');return data;
}
function parsePlan(text) {
  let obj;
  try { obj = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('AI 的回复格式不完整，请重试；时间表尚未修改。'); }
  if (!obj||typeof obj.reply !== 'string' || !obj.reply.trim() || obj.reply.length > 15000 || !Array.isArray(obj.tasks) || obj.tasks.length > 30) throw new Error('AI 返回的对话或任务格式不正确。');
  const time = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if (obj.plans !== undefined && (!Array.isArray(obj.plans) || obj.plans.length > 8)) throw new Error('一次最多生成 8 项长期或每日计划。');
  if (obj.plans?.some(p => !p||typeof p.id !== 'string' || !p.id.trim())||new Set((obj.plans||[]).map(p=>p.id)).size!==(obj.plans||[]).length) throw new Error('AI 计划缺少唯一编号或存在重复，请重试。');
  const ids=new Set();
  const plans = (obj.plans || []).map(p => ({ ...normalizePlan(p), schedule: engine.schedule(p.schedule, p) }));
  return { reply: obj.reply, plans, tasks: obj.tasks.map(t => {
    if (!t||!['add', 'update', 'delete'].includes(t.action) || typeof t.id !== 'string' || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 70 || !date(t.date) || !time(t.start) || !time(t.end) || t.end <= t.start || !Number.isInteger(t.priority) || t.priority < 1 || t.priority > 5 || !Array.isArray(t.tags) || t.tags.length > 6 || t.tags.some(x => typeof x !== 'string' || x.length > 20) || typeof t.content !== 'string' || t.content.length > 1000 || (t.action !== 'delete' && t.content.trim().length < 15) || typeof t.assumption !== 'string') throw new Error('AI 返回了无效或缺少具体步骤的任务。请让它补充后重试，原日程未改变。');
    if(t.action!=='add'&&!t.id.trim())throw new Error('修改或删除任务需要有效编号。');if(t.id&&ids.has(t.id))throw new Error('AI 对同一任务返回了多条操作，请重试。');if(t.id)ids.add(t.id);
    return { schedule: engine.schedule(t.schedule, t), action: t.action, id: t.id, title: t.title.trim(), date: t.date, start: t.start, end: t.end, priority: t.priority, tags: t.tags, content: t.content, assumption: t.assumption.slice(0, 500), planId: typeof t.planId === 'string' ? t.planId.slice(0, 100) : '' };
  }) };
}
const scheduleSchema = { type: 'object', additionalProperties: false, required: ['flexible', 'earliest', 'latest'], properties: { flexible: { type: 'boolean' }, earliest: { type: 'string' }, latest: { type: 'string' } } };
const taskSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'tasks', 'plans'], properties: {
    reply: { type: 'string' },
    plans: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'kind', 'title', 'goal', 'startDate', 'endDate', 'start', 'end', 'weekdays', 'priority', 'tags', 'content', 'state', 'milestones', 'schedule'], properties: {
        schedule: scheduleSchema,
        id: { type: 'string' }, kind: { type: 'string', enum: ['long', 'daily'] }, title: { type: 'string' }, goal: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, weekdays: { type: 'array', items: { type: 'integer' } }, priority: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } }, content: { type: 'string' }, state: { type: 'string', enum: ['active', 'paused', 'done'] }, milestones: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'due', 'done'], properties: { id: { type: 'string' }, title: { type: 'string' }, due: { type: 'string' }, done: { type: 'boolean' } } } }
      }
    } },
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['action', 'id', 'title', 'date', 'start', 'end', 'priority', 'tags', 'content', 'assumption', 'planId', 'schedule'], properties: {
        schedule: scheduleSchema,
        action: { type: 'string', enum: ['add', 'update', 'delete'] }, id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, priority: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } }, content: { type: 'string' }, assumption: { type: 'string' }, planId: { type: 'string' }
      }
    } }
  }
};
function requestTuning(provider) {
  const url = new URL(provider.url), mode = provider.planningSpeed || 'balanced';
  if (url.hostname === 'api.deepseek.com' && /^(deepseek-flash|deepseek-v4)/.test(provider.model) && provider.protocol === 'Chat Completions') return { max_tokens: mode === 'fast' ? 16384 : 65536, thinking: { type: mode === 'fast' ? 'disabled' : 'enabled' }, ...(mode === 'fast' ? {} : { reasoning_effort: mode === 'deep' ? 'high' : 'low' }) };
  if (url.hostname === 'api.openai.com' && /^gpt-6(?:\.1)?-(luna|sol|terra|astra)(?:-|$)/.test(provider.model) && provider.protocol === 'Responses') return { max_output_tokens: 16384, reasoning: { ...(provider.reasoningSummary ? { summary: 'auto' } : {}), effort: mode === 'deep' ? 'high' : 'low' } };
  return {};
}
async function chat(provider, key, input, options = {}) {
  if (!provider?.enabled || provider.role === 'voice') throw new Error('请先选择已启用的规划供应商。');
  if (!key) throw new Error('该供应商还没有 API Key，请在 API 管理中填写。');
  if (!['Responses', 'Chat Completions'].includes(provider.protocol)) throw new Error('规划服务需选择 Responses 或 Chat Completions 协议。');
  const prepared = engine.prepare(input);
  options.onProgress?.({ phase: 'planning', reply: '', reasoning: '' });
  const messages = [{ role: 'system', content: skill.instructions(prepared.context) + '\n\n' + skill.contract }, { role: 'user', content: '当前时间与日程上下文：' + JSON.stringify(prepared.context) }, ...prepared.messages];
  const responses = provider.protocol === 'Responses';
  const body = responses
    ? { model: provider.model, input: messages, store: false, text: { format: { type: 'json_schema', name: 'time_plan', strict: true, schema: taskSchema } } }
    : { model: provider.model, messages, response_format: { type: 'json_object' } };
  body.stream = provider.stream !== false;
  if (responses && provider.reasoningSummary) body.reasoning = { summary: 'auto' };
  if (!responses && provider.template === 'qwen-cn') body.enable_thinking = false;
  Object.assign(body, requestTuning(provider));
  const result = await requestAI(endpoint(provider.url, responses ? 'responses' : 'chat/completions'), body, key, options);
  options.onProgress?.({ phase: 'validating', reply: replyPrefix(result.text), reasoning: result.reasoning, reasoningLabel: result.reasoningLabel });
    const checked = engine.repair(parsePlan(result.text), {...input.context,rhythm:prepared.context.rhythm,requestText:String(input.messages?.at(-1)?.content||'')});
  return { ...checked, contextStats: prepared.stats, reasoning: result.reasoning, reasoningLabel: result.reasoningLabel };
}
async function transcribe(provider, key, bytes, mime) {
  if (!provider?.enabled || provider.role === 'plan' || provider.protocol !== 'Audio Transcriptions') throw new Error('请选择语音用途、Audio Transcriptions 协议的供应商。');
  if (!key) throw new Error('语音供应商尚未填写 API Key。');
  if (!bytes?.byteLength || bytes.byteLength > 24 * 1024 * 1024) throw new Error('录音为空或超过 24MB，请分段录入。');
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mime || 'audio/webm' }), mime?.includes('ogg') ? 'recording.ogg' : 'recording.webm');
  form.set('model', provider.model); form.set('language', 'zh'); form.set('response_format', 'json');
  const data = await request(endpoint(provider.url, 'audio/transcriptions'), { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
  if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('未识别出文字，请再录一次。');
  return data.text.slice(0, 10000);
}
const email = s => typeof s === 'string' && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s) && s.length <= 254;
function validateMailbox(config) {
  const c = { enabled: !!config.enabled, host: String(config.host || 'smtp.qq.com').trim(), port: Number(config.port || 465), from: String(config.from || '').trim(), to: String(config.to || '').trim() };
  if (c.enabled || c.from || c.to) {
    if (!email(c.from) || !email(c.to)) throw new Error('请填写有效的发件邮箱和默认收件邮箱。');
    if (!/^[a-zA-Z0-9.-]+$/.test(c.host) || ![465, 587].includes(c.port)) throw new Error('邮件服务器需使用 465 或 587 加密端口。');
  }
  return c;
}
async function sendMail(config, auth, event, test = false) {
  if (!auth) throw new Error('请先填写邮箱 SMTP 授权码。');
  const to = event?.emailTo || config.to;
  if (!email(to)) throw new Error('收件邮箱格式无效。');
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, requireTLS: true, auth: { user: config.from, pass: auth }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try {
    const result = await transport.sendMail({ from: config.from, to, subject: test ? '时序 · 邮件提醒测试' : '时序提醒：' + event.title, text: test ? '这是一封由你点击测试按钮发送的邮件。邮件提醒连接成功。' : `${event.title}\n${event.date} ${event.start}–${event.end}\n\n${event.content || '打开时序查看任务详情。'}\n\n此邮件由你在时序中启用的任务提醒自动发送。` });
    if (!result.accepted?.length) throw new Error('收件服务器未接受邮件。');
    return { accepted: true };
  } finally { transport.close(); }
}
function dueMails(events, config, log, timestamp = Date.now()) {
  if (!config.enabled) return [];
  return events.filter(e => {
    if (!e.emailEnabled || e.state === 'done' || !email(e.emailTo || config.to)) return false;
    const start = Date.parse(`${e.date}T${e.start}:00+08:00`), end = Date.parse(`${e.date}T${e.end}:00+08:00`);
    const due = start - (e.emailLead || 0) * 60000;
    const key = [e.id, e.date, e.start, e.emailLead || 0, e.emailTo || config.to].join('|');
    e.mailKey = key;
    return Number.isFinite(due) && timestamp >= due && timestamp < end && !log.some(x => x.key === key);
  });
}
module.exports = { endpoint, parsePlan, requestTuning, chat, transcribe, email, validateMailbox, sendMail, dueMails };
