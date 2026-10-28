const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {chat}=require('../services.cjs');
const {replyPrefix}=require('../ai-stream.cjs');
const {requestAI}=require('../ai-stream.cjs');
const input={context:{},messages:[{role:'user',content:'先讨论复习方法'}]};
const provider={enabled:true,role:'plan',model:'fixture',protocol:'Chat Completions'};
const answer=JSON.stringify({reply:'先分清重点，再安排练习。\n保留休息时间。',tasks:[],plans:[]});
async function serve(handler,run){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${server.address().port}/v1`);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
const event=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
test('reply preview extracts the top-level reply without exposing task JSON or broken escapes',()=>{
 assert.equal(replyPrefix('{"plans":[{"title":"reply"}],"reply":"第一行\\n第二行\\u4e2d\\u'), '第一行\n第二行中');
 assert.equal(replyPrefix('{"tasks":[{"content":"\\\"reply\\\":\\\"错误内容"}],"reply":"正确回复"}'),'正确回复');
 assert.equal(replyPrefix('{"tasks":['),'');
});
test('Chat Completions streams provide early status, thought content and readable reply before completion',async()=>{
 const updates=[];await serve(async(req,res)=>{
  let body='';for await(const c of req)body+=c;assert.equal(JSON.parse(body).stream,true);
  res.setHeader('Content-Type','text/event-stream');res.write(': keepalive\r\n\r\n'+event({choices:[{delta:{reasoning_content:'先核对已有安排。'}}]}));
  for(const part of [answer.slice(0,18),answer.slice(18)]){res.write(event({choices:[{delta:{content:part}}]}));await new Promise(r=>setTimeout(r,15));}
  res.end(event({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\r\n\r\n');
 },async url=>{const result=await chat({...provider,url},'fixture',input,{onProgress:u=>updates.push(u)});assert.equal(result.reply,JSON.parse(answer).reply);assert.equal(result.reasoning,'先核对已有安排。');assert.ok(updates.some(u=>u.phase==='waiting'));assert.ok(updates.some(u=>u.phase==='answering'&&u.reply&&u.reply!==result.reply));assert.equal(updates.at(-1).phase,'validating');});
});
test('Responses SSE handles split UTF-8, CRLF and summary events and requires a completed response',async()=>{
 await serve(async(req,res)=>{
  let body='';for await(const c of req)body+=c;assert.deepEqual(JSON.parse(body).reasoning,{summary:'auto'});assert.equal(Object.keys(JSON.parse(body).text.format.schema.properties)[0],'reply');
  res.setHeader('Content-Type','text/event-stream');
  const bytes=Buffer.from(event({type:'response.created'})+event({type:'response.reasoning_summary_text.delta',delta:'检查可用时段。'})+event({type:'response.output_text.delta',delta:answer})+event({type:'response.completed',response:{status:'completed'}}));
  for(let i=0;i<bytes.length;i+=7){res.write(bytes.subarray(i,i+7));await new Promise(r=>setImmediate(r));}res.end();
 },async url=>{const result=await chat({...provider,url,protocol:'Responses',reasoningSummary:true},'fixture',input);assert.equal(result.reply,JSON.parse(answer).reply);assert.equal(result.reasoning,'检查可用时段。');});
});
test('cancel, truncated streams and service failures never return a plan',async()=>{
 await serve(async(req,res)=>{
  for await(const c of req){}res.setHeader('Content-Type','text/event-stream');
  if(req.url.includes('wait')){res.write(': waiting\n\n');return;}
  if(req.url.includes('error'))return res.end(event({error:{message:'fixture error'}}));
  res.end(event({choices:[{delta:{content:answer}}]}));
 },async url=>{
  await assert.rejects(chat({...provider,url:url+'/truncated'},'fixture',input),/响应中断/);
  await assert.rejects(chat({...provider,url:url+'/error'},'fixture',input),/中断/);
  const controller=new AbortController();setTimeout(()=>controller.abort(),40);await assert.rejects(chat({...provider,url:url+'/wait'},'fixture',input,{signal:controller.signal}),e=>e.code==='AI_CANCELLED');
 });
});
test('non-streaming compatibility remains explicit and supports final reasoning summaries',async()=>{
 await serve(async(req,res)=>{let body='';for await(const c of req)body+=c;assert.equal(JSON.parse(body).stream,false);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[{type:'summary_text',text:'按重要性排序。'}]},{content:[{type:'output_text',text:answer}]}]}));},async url=>{const result=await chat({...provider,url,protocol:'Responses',stream:false},'fixture',input);assert.equal(result.reasoning,'按重要性排序。');});
});
test('completed SSE is returned immediately even if a gateway leaves its connection open',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}res.setHeader('Content-Type','text/event-stream');res.write(event({choices:[{delta:{content:answer},finish_reason:'stop'}]}));},async url=>{const value=await requestAI(url,{stream:true},'fixture',{timeouts:{idleMs:100,totalMs:500}});assert.equal(value.text,answer);});
});
test('continuous reasoning may exceed the initial wait without a fixed whole-request cutoff',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}res.setHeader('Content-Type','text/event-stream');res.write(event({choices:[{delta:{reasoning_content:'开始分析。'}}]}));let n=0;const timer=setInterval(()=>{if(n++<7)res.write(event({choices:[{delta:{reasoning_content:'继续处理。'}}]}));else{clearInterval(timer);res.end(event({choices:[{delta:{content:answer},finish_reason:'stop'}]}));}},55);res.on('close',()=>clearInterval(timer));},async url=>{
  const value=await requestAI(url,{stream:true},'fixture',{timeouts:{initialMs:200,idleMs:200,progressMs:200,totalMs:0}});assert.equal(value.text,answer);assert.match(value.reasoning,/继续处理/);
 });
});
test('SSE keep-alives keep a queued request connected but do not hide endless queueing or stalled reasoning',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}res.setHeader('Content-Type','text/event-stream');if(req.url.includes('stalled'))res.write(event({choices:[{delta:{reasoning_content:'先分析。'}}]}));let n=0;const timer=setInterval(()=>{if(!req.url.includes('endless')&&!req.url.includes('stalled')&&n++===5){clearInterval(timer);res.end(event({choices:[{delta:{content:answer},finish_reason:'stop'}]}));}else res.write(': keep-alive\r\n\r\n');},55);res.on('close',()=>clearInterval(timer));},async url=>{
  const updates=[],opts={timeouts:{initialMs:500,idleMs:180,progressMs:220,totalMs:0}};
  const value=await requestAI(url,{stream:true},'fixture',{...opts,onProgress:v=>updates.push(v.phase)});assert.equal(value.text,answer);assert.ok(updates.includes('queued'));
  await assert.rejects(requestAI(url+'/endless',{stream:true},'fixture',opts),/排队等待/);
  await assert.rejects(requestAI(url+'/stalled',{stream:true},'fixture',opts),/保持连接.*没有返回新的思考/);
 });
});
test('a silent connection and an explicit total limit still stop, and queue keep-alives remain immediately cancellable',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}res.setHeader('Content-Type','text/event-stream');res.flushHeaders();if(req.url.includes('silent'))return;const timer=setInterval(()=>res.write(': keep-alive\n\n'),40);res.on('close',()=>clearInterval(timer));},async url=>{
  await assert.rejects(requestAI(url+'/silent',{},'fixture',{timeouts:{initialMs:500,idleMs:100,progressMs:500}}),/未收到任何数据/);
  await assert.rejects(requestAI(url,{},'fixture',{timeouts:{initialMs:500,idleMs:200,totalMs:150}}),/指定等待时间/);
  const c=new AbortController();setTimeout(()=>c.abort(),120);await assert.rejects(requestAI(url,{},'fixture',{signal:c.signal}),e=>e.code==='AI_CANCELLED');
 });
});
test('non-streaming queue whitespace keeps the connection alive without counting as a model answer',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}res.setHeader('Content-Type','application/json');let n=0;const timer=setInterval(()=>{if(!req.url.includes('endless')&&n++===5){clearInterval(timer);res.end(JSON.stringify({choices:[{message:{content:answer}}]}));}else res.write('\n ');},45);res.on('close',()=>clearInterval(timer));},async url=>{
  const opts={timeouts:{initialMs:500,idleMs:160,progressMs:200,totalMs:0}};assert.equal((await requestAI(url,{stream:false},'fixture',opts)).text,answer);
  await assert.rejects(requestAI(url+'/endless',{stream:false},'fixture',opts),/排队等待/);
 });
});
test('reasoning that uses up the model output budget reports truncation rather than a timeout or a partial plan',async()=>{
 await serve(async(req,res)=>{for await(const c of req){}if(req.url.includes('json')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({choices:[{message:{reasoning_content:'思考还未完成。',content:''},finish_reason:'length'}]}));}res.setHeader('Content-Type','text/event-stream');res.end(event({choices:[{delta:{reasoning_content:'思考还未完成。'},finish_reason:'length'}]}));},async url=>{
  for(const suffix of ['','/json'])await assert.rejects(requestAI(url+suffix,{},'fixture'),/输出额度.*被截断.*不是等待超时/);
 });
});
test('busy servers retry once before output; invalid credentials do not retry and cancellation interrupts backoff',async()=>{
 let count=0;await serve(async(req,res)=>{for await(const c of req){}count++;res.setHeader('Content-Type','application/json');if(req.url.includes('unauthorized'))res.statusCode=401;else if(req.url.includes('cancel')||count===1)res.statusCode=503;res.end(res.statusCode===200?JSON.stringify({choices:[{message:{content:answer}}]}):'{}');},async url=>{
  const updates=[];const value=await requestAI(url,{},'fixture',{onProgress:u=>updates.push(u.phase)});assert.equal(value.text,answer);assert.equal(count,2);assert.ok(updates.includes('retrying'));
  count=0;await assert.rejects(requestAI(url+'/unauthorized',{},'fixture'),/401/);assert.equal(count,1);
  count=0;const c=new AbortController();setTimeout(()=>c.abort(),30);await assert.rejects(requestAI(url+'/cancel',{},'fixture',{signal:c.signal}),e=>e.code==='AI_CANCELLED');assert.equal(count,1);
 });
});
