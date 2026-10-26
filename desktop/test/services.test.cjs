const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const nodemailer = require('nodemailer');
const { endpoint, parsePlan, chat, transcribe, validateMailbox, dueMails, sendMail } = require('../services.cjs');
const task = { action: 'add', id: '', title: '复习微积分', date: '2026-10-24', start: '09:00', end: '10:00', priority: 2, tags: ['学习'], content: '先回顾导数定义，再独立完成五道练习，最后标记错题并写出原因。', assumption: '先安排一小时，可继续调整。' };
test('reject invalid and incomplete model plans instead of changing user schedule', () => {
  assert.equal(parsePlan(JSON.stringify({ reply: '可以这样安排。', tasks: [task] })).tasks[0].content, task.content);
  assert.deepEqual(parsePlan('{"reply":"先讨论一下目标。","tasks":[]}').tasks, []);
  for (const change of [{ date: '2026-02-30' }, { start: '24:00' }, { end: '08:59' }, { priority: 6 }, { content: '复习' }]) assert.throws(() => parsePlan(JSON.stringify({ reply: '建议', tasks: [{ ...task, ...change }] })));
});
test('endpoint requires TLS outside local development and does not accept credentials', () => {
  assert.equal(endpoint('https://api.example.com/v1/', 'responses'), 'https://api.example.com/v1/responses');
  assert.throws(() => endpoint('http://example.com/v1', 'responses'));
  assert.throws(() => endpoint('https://key@example.com/v1', 'responses'));
});
test('AI malformed, duplicate or unidentifiable modifications fail without scheduling anything',()=>{
 for(const value of [null,{reply:'建议',tasks:[null]},{reply:'建议',tasks:[{...task,action:'update',id:''}]},{reply:'建议',tasks:[{...task,id:'same'},{...task,id:'same'}]},{reply:'建议',tasks:[],plans:[null]}])assert.throws(()=>parsePlan(JSON.stringify(value)),/格式|编号|多条|无效/);
});
test('oversized, interrupted and incorrectly wrapped responses produce actionable errors',async()=>{
 const server=http.createServer(async(req,res)=>{for await(const chunk of req){}res.setHeader('Content-Type','application/json');if(req.url.includes('/large/'))return res.end('x'.repeat(2_000_100));if(req.url.includes('/interrupted/')){res.write('{"choices":');return setTimeout(()=>res.destroy(),20);}res.end('null');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const p={enabled:true,role:'plan',protocol:'Chat Completions',model:'test',url:''},input={context:{},messages:[{role:'user',content:'建议'}]};try{for(const [route,message] of [['large',/过大/],['interrupted',/响应中断|连接服务失败/],['wrong',/响应格式无效/]])await assert.rejects(chat({...p,url:`http://127.0.0.1:${server.address().port}/${route}/v1`},'fake',input),message);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('advice, structured tasks and voice transcription through local service contract', async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    const text = JSON.stringify({ reply: '安排前先留出休息时间。', tasks: req.url.includes('responses') ? [task] : [] });
    res.end(JSON.stringify(req.url.includes('transcriptions') ? { text: '今天独立完成了三道习题，明天复习错题。' } : req.url.includes('responses') ? { output: [{ content: [{ type: 'output_text', text }] }] } : { choices: [{ message: { content: text } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const p = { enabled: true, role: 'plan', protocol: 'Chat Completions', model: 'test-model', url: `http://127.0.0.1:${server.address().port}/v1` };
    const input = { context: { selectedDate: '2026-10-24' }, messages: [{ role: 'user', content: '我应该怎么安排复习？' }] };
    assert.equal((await chat(p, 'test-secret', input)).tasks.length, 0);
    assert.equal((await chat({ ...p, protocol: 'Responses' }, 'test-secret', input)).tasks[0].content, task.content);
    const transcript = await transcribe({ ...p, protocol: 'Audio Transcriptions', role: 'voice' }, 'test-secret', new Uint8Array([1, 2, 3]), 'audio/webm');
    assert.match(transcript, /错题/); assert.match(requests[2].body, /recording.webm/); assert.match(requests[2].body, /name="language"/);
    assert.equal(requests[0].auth, 'Bearer test-secret'); assert.match(requests[0].body, /完成标准/);
    await assert.rejects(chat(p, '', input), /API Key/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('mail is opt-in per event, uses lead time, excludes completed and deduplicates failures too', () => {
  const cfg = validateMailbox({ enabled: true, from: 'sender@qq.com', to: 'me@example.com' });
  const e = { ...task, id: 'task1', state: 'todo', emailEnabled: true, emailLead: 15 };
  const time = Date.parse('2026-10-24T08:45:00+08:00');
  assert.equal(dueMails([e], cfg, [], time - 1).length, 0);
  assert.equal(dueMails([e], cfg, [], time).length, 1);
  assert.equal(dueMails([e], cfg, [{ key: e.mailKey, status: 'failed' }], time).length, 0);
  assert.equal(dueMails([{ ...e, emailEnabled: false }, { ...e, state: 'done' }], cfg, [], time).length, 0);
  assert.equal(dueMails([e], { ...cfg, enabled: false }, [], time).length, 0);
  assert.equal(dueMails([e], cfg, [], Date.parse('2026-10-24T10:00:00+08:00')).length, 0);
  assert.throws(() => validateMailbox({ enabled: true, from: 'x', to: 'y' }));
});
test('mail contains actionable information, excludes private feelings, uses encrypted transport', async () => {
  const original = nodemailer.createTransport; let sent, config, closed = false;
  nodemailer.createTransport = c => { config = c; return { sendMail: async value => { sent = value; return { accepted: ['me@example.com'] }; }, close: () => { closed = true; } }; };
  try {
    await sendMail({ host: 'smtp.qq.com', port: 465, from: 'sender@qq.com', to: 'me@example.com' }, 'local-authorization', { ...task, feeling: 'private diary' });
    assert.match(sent.text, /五道练习/); assert.doesNotMatch(sent.text, /private diary/); assert.equal(config.secure, true); assert.equal(config.requireTLS, true); assert.equal(closed, true);
  } finally { nodemailer.createTransport = original; }
});
