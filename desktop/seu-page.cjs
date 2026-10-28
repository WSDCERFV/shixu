// These functions execute only in the isolated, official school page.
function fillSchoolLogin(credentials, allowSubmit) {
  const visible = el => el && !el.disabled && el.getClientRects().length;
  if (window.__shixuLoginFilled) return { filled: true, submitted: false };
  const password = [...document.querySelectorAll('input[type="password"]')].find(visible);
  if (!password) return { filled: false };
  const scope = password.closest('form') || document;
  const candidates = [...scope.querySelectorAll('input')].filter(visible);
  const user = candidates.find(el => /^(username|userName|user_name|account|loginName|login_username|cas_username)$/i.test(el.name) || /^(username|userName|user_name|account|loginName|login_username|cas_username)$/i.test(el.id))
    || candidates.find(el => ['text', 'tel', 'email'].includes(el.type) && /账号|学号|一卡通|用户名|username|account/i.test(el.placeholder || ''));
  if (!user || (password.value && password.value !== credentials.password)) return { filled: false };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  for (const [el, value] of [[user, credentials.account], [password, credentials.password]]) {
    if (el.value && el.value !== value) return { filled: false };
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  window.__shixuLoginFilled = true;
  const captcha = candidates.some(el => /captcha|verifycode|checkcode|验证码/i.test(el.name + ' ' + el.id + ' ' + el.placeholder)) || [...scope.querySelectorAll('[class*="captcha"],[id*="captcha"],[class*="slider"]')].some(visible);
  const submit = [...scope.querySelectorAll('#login_submit,#login_submit_btn,#loginBtn,button,input[type="submit"]')].find(el => visible(el) && !/短信|扫码/.test(el.textContent || '') && (el.type === 'submit' || /登录|登 录|login|sign in/i.test(el.textContent || el.value || el.id)));
  if (allowSubmit && !captcha && submit) { submit.click(); return { filled: true, submitted: true }; }
  return { filled: true, submitted: false, captcha };
}
async function readSchoolTerms() {
  try {
    const response = await fetch('/jwapp/sys/wdkb/modules/jshkcb/xnxqcx.do', { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('学期列表读取失败，请检查学校登录状态。');
    const data = await response.json(); return { rows: data?.datas?.xnxqcx?.rows };
  } catch { return { error: '未能读取本科生“我的课表”的学期列表，请确认登录与网络后重试。' }; }
}
async function readSchoolCourses(termCode) {
  try {
    const read = async url => {
      const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('学校课表读取失败，请检查登录状态。');
      try { return await response.json(); } catch { throw new Error('登录可能已失效，请重新进入“我的课表”。'); }
    };
    const terms = (await read('/jwapp/sys/wdkb/modules/jshkcb/xnxqcx.do'))?.datas?.xnxqcx?.rows;
    if (!Array.isArray(terms)) throw new Error('学期列表读取失败，已停止抓取。');
    const term = terms.find(t => String(t.DM) === termCode); if (!term) throw new Error('所选学期已不在学校列表中，请重新刷新学期。');
    const rows = [], pages = new Set(); let expected = null;
    for (let page = 1; page <= 20; page++) {
      const result = await read('/jwapp/sys/wdkb/modules/xskcb/xskcb.do?XNXQDM=' + encodeURIComponent(termCode) + '&pageSize=500&pageNumber=' + page);
      const block = result?.datas?.xskcb, batch = block?.rows;
      if (!Array.isArray(batch)) throw new Error('学校返回的课表格式不正确，已停止导入。');
      const fingerprint = JSON.stringify(batch); if (pages.has(fingerprint) && batch.length) throw new Error('学校重复返回同一页课表，无法确认记录完整性，请重试。'); pages.add(fingerprint);
      if (page === 1 && block.totalSize != null) { expected = Number(block.totalSize); if (!Number.isInteger(expected) || expected < 0 || expected > 2000) throw new Error('学校课表记录数量异常，请分学期读取。'); }
      rows.push(...batch); if (rows.length > 2000) throw new Error('课程记录过多，请分学期读取。');
      if (expected !== null ? rows.length === expected : batch.length < 500) break;
      if (!batch.length || (expected !== null && rows.length > expected) || page === 20) throw new Error('学校课表分页不完整，请重试；本次未导入。');
    }
    if (!rows.length) throw new Error('所选学期没有课表记录，请核对学期和登录账号。');
    if (rows.some(row => row.XNXQDM != null && String(row.XNXQDM) !== termCode)) throw new Error('学校返回的课程学期与所选学期不一致，已停止导入。');
    return { termCode: String(term.DM), termName: String(term.MC || ''), rows };
  } catch (e) { return { error: String(e.message || '学校课表读取失败。') }; }
}
module.exports = { fillSchoolLogin, readSchoolTerms, readSchoolCourses };
