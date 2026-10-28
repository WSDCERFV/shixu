// Both supported protocols use SSE. Only validated, complete plans reach the calendar.
function replyPrefix(text) {
  // Extract just the top-level JSON reply string, including partially received escapes.
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === '"') {
      const start = i++; let escaped = false;
      for (; i < text.length; i++) { if (escaped) escaped = false; else if (text[i] === '\\') escaped = true; else if (text[i] === '"') break; }
      if (depth !== 1 || text.slice(start, i + 1) !== '"reply"') continue;
      const rest = text.slice(i + 1), match = rest.match(/^\s*:\s*"/); if (!match) continue;
      const value = rest.slice(match[0].length); let out = '';
      for (let j = 0; j < value.length; j++) {
        if (value[j] === '"') return out;
        if (value[j] !== '\\') { out += value[j]; continue; }
        const code = value[++j]; if (code === undefined) break;
        if (code === 'u') { const hex = value.slice(j + 1, j + 5); if (!/^[0-9a-f]{4}$/i.test(hex)) break; out += String.fromCharCode(parseInt(hex, 16)); j += 4; }
        else out += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' })[code] ?? '';
      }
      return out;
    }
  }
  return '';
}
async function requestAI(url, body, key, { signal, onProgress = () => {}, timeouts = {} } = {}) {
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const idleMs=timeouts.idleMs??300000,initialMs=timeouts.initialMs??900000,progressMs=timeouts.progressMs??900000,totalMs=timeouts.totalMs??0;
  let timeoutKind='',idleTimer,progressTimer,slowTimer,hasOutput=false;
  const stopFor=kind=>{timeoutKind=kind;controller.abort();};
  // Active reasoning can outlast a wall-clock deadline. Bound silence and queueing instead.
  const totalTimer=totalMs>0?setTimeout(()=>stopFor('total'),totalMs):null;
  let text = '', reasoning = '', reasoningLabel = '模型思考摘要', terminal = false, phase = 'waiting';
  const progress = () => onProgress({ phase, reply: replyPrefix(text).slice(0, 15000), reasoning, reasoningLabel });
  const active=(meaningful=false)=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>stopFor('idle'),idleMs);if(meaningful){hasOutput=true;clearTimeout(progressTimer);progressTimer=setTimeout(()=>stopFor('progress'),progressMs);clearTimeout(slowTimer);slowTimer=setTimeout(()=>onProgress({phase:'waiting-long',reply:replyPrefix(text).slice(0,15000),reasoning,reasoningLabel}),60000);}};
  const addReasoning = (value, label) => { if (typeof value !== 'string' || !value) return; active(true);reasoningLabel = label; reasoning = (reasoning + value).slice(0, 20000); phase = 'thinking'; progress(); };
  const addText = value => { if (typeof value !== 'string' || !value) return; active(true);text += value; if (text.length > 300000) throw new Error('AI 返回内容过大，请缩小规划范围。'); phase = 'answering'; progress(); };
  const responseText = data => (data.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('');
  const acceptJSON = data => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('服务响应格式无效，请检查协议或稍后重试。');
    if (data.error || ['failed', 'cancelled'].includes(data.status)) throw new Error('AI 服务未能完成回复，请检查模型权限或稍后重试。');
    if(data.choices?.[0]?.finish_reason==='length')throw new Error('已达到模型的输出额度，思考或回复被截断；这不是等待超时。可切换快速模式、分批安排或提高服务端输出额度后重试。');
    if (data.status === 'incomplete') throw new Error('AI 回复被截断，请缩小规划范围后重试。');
    if (data.choices?.[0]?.finish_reason === 'content_filter') throw new Error('服务未能生成这次回复，请调整需求后重试。');
    for (const item of data.output || []) for (const part of item.summary || []) if (part.type === 'summary_text') addReasoning(part.text, '模型思考摘要');
    const message = data.choices?.[0]?.message;
    if (message?.reasoning_content) addReasoning(message.reasoning_content, '模型返回的思考');
    addText(responseText(data) || message?.content || ''); terminal = true;
  };
  const acceptEvent = data => {
    if (data.error || data.type === 'error' || data.type === 'response.failed') throw new Error('AI 服务中断了回复，请稍后重试。');
    if (data.type === 'response.incomplete') throw new Error('AI 回复未完成，请缩小规划范围后重试。');
    if (['response.created', 'response.in_progress'].includes(data.type)) { phase = 'thinking'; progress(); }
    if (data.type === 'response.reasoning_text.delta' && data.delta) { active(true);phase='thinking';progress(); }
    if (data.type === 'response.reasoning_summary_text.delta') addReasoning(data.delta, '模型思考摘要');
    if (data.type === 'response.output_text.delta') addText(data.delta);
    if (data.type === 'response.completed') {
      if (data.response?.status && data.response.status !== 'completed') throw new Error('AI 回复未完成，请重试。');
      if (!text) addText(responseText(data.response || {}));
      if (!reasoning) for (const item of data.response?.output || []) for (const part of item.summary || []) if (part.type === 'summary_text') addReasoning(part.text, '模型思考摘要');
      terminal = true;
    }
    const choice = data.choices?.[0];
    if (choice) {
      if (choice.delta?.reasoning_content) addReasoning(choice.delta.reasoning_content, '模型返回的思考');
      if (choice.delta?.content) addText(choice.delta.content);
      if(choice.finish_reason==='length')throw new Error('已达到模型的输出额度，思考或回复被截断；这不是等待超时。可切换快速模式、分批安排或提高服务端输出额度后重试。');
      if(choice.finish_reason==='content_filter')throw new Error('服务未能生成这次回复，请调整需求后重试。');
      if (choice.finish_reason === 'stop') terminal = true;
    }
  };
  let reader;
  try {
    idleTimer=setTimeout(()=>stopFor('initial'),initialMs);progressTimer=setTimeout(()=>stopFor('initial'),initialMs);slowTimer=setTimeout(()=>onProgress({phase:'waiting-long',reply:'',reasoning:'',reasoningLabel}),60000);
    onProgress({ phase: 'sending', reply: '', reasoning: '' });
    let response;
    for(let attempt=0;attempt<2;attempt++){
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), redirect: 'error', signal: combined });
      if(attempt===0&&[429,502,503,504].includes(response.status)){
        await response.body?.cancel().catch(()=>{});onProgress({phase:'retrying',reply:'',reasoning:''});
        await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(combined.reason);};const timer=setTimeout(()=>{combined.removeEventListener('abort',abort);resolve();},1000);combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();});
        continue;
      }
      break;
    }
    if (!response.ok) { await response.body?.cancel().catch(()=>{});throw new Error(`服务返回 ${response.status}。请检查密钥、模型权限、余额和服务协议。`); }
    active();progress(); reader = response.body.getReader(); const decoder = new TextDecoder(); let size = 0, buffer = '';
    const streaming = (response.headers.get('content-type') || '').includes('text/event-stream');
    const frame = raw => {
      const parts = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
      if (!parts.length) { if(!hasOutput&&raw.split('\n').some(line=>line.startsWith(':'))){phase='queued';progress();}return; }
      const value = parts.join('\n'); if (value === '[DONE]') { terminal = true; return; }
      let data; try { data = JSON.parse(value); } catch { throw new Error('AI 流式回复格式异常，尚未修改日程。'); }
      acceptEvent(data);
    };
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      active();
      size += part.value.byteLength; if (size > (streaming ? 8000000 : 2000000)) throw new Error('服务返回内容过大。');
      const decoded=decoder.decode(part.value,{stream:true});if(!streaming&&decoded.trim())active(true);buffer+=decoded;
      if (streaming) {
        let separator; while ((separator = /\r?\n\r?\n/.exec(buffer))) { frame(buffer.slice(0, separator.index).replace(/\r\n/g, '\n')); buffer = buffer.slice(separator.index + separator[0].length);if(terminal)break; }
        if(terminal)break;
      }
    }
    buffer += decoder.decode();
    if (streaming) { if (!terminal && buffer.trim()) frame(buffer.replace(/\r\n/g, '\n')); if (!terminal) throw new Error('服务响应中断，回复尚未完成；原日程与草案未改变。'); }
    else { let data; try { data = JSON.parse(buffer); } catch { throw new Error('服务未返回有效 JSON。'); } acceptJSON(data); }
    combined.throwIfAborted(); return { text, reasoning, reasoningLabel };
  } catch (error) {
    if (signal?.aborted) { const cancelled = new Error('已停止生成，原日程与已有草案均已保留。'); cancelled.code = 'AI_CANCELLED'; throw cancelled; }
    if (combined.aborted) throw new Error((timeoutKind==='total'?'本轮生成已超过指定等待时间。':timeoutKind==='initial'?'服务长时间尚未开始输出，排队等待已结束。':timeoutKind==='progress'?'服务仍保持连接，但长时间没有返回新的思考或回复内容。':'连接长时间未收到任何数据，可能已中断。')+'本轮已停止，原日程与草案已保留，可稍后重试。');
    if (error instanceof TypeError) throw new Error(text ? '服务响应中断，请检查网络后重试。' : '连接服务失败，请检查地址与网络。');
    throw error;
  } finally { clearTimeout(totalTimer);clearTimeout(idleTimer);clearTimeout(progressTimer);clearTimeout(slowTimer);if (reader) await reader.cancel().catch(() => {}); }
}
module.exports = { requestAI, replyPrefix };
