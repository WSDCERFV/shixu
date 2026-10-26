const {BrowserWindow,WebContentsView,session,screen,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parseSeuCourses,semesterMondays}=require('./seu-courses.cjs');
const D=require('./planner-domain.cjs');
const ENTRY='https://ehall.seu.edu.cn/appShow?appId=4770397878132218';
const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='seu.edu.cn'||u.hostname.endsWith('.seu.edu.cn'))&&!u.username&&!u.password;}catch{return false;}};
const secureURL=url=>{try{const u=new URL(url);if(u.protocol==='http:')u.protocol='https:';return allowed(u.href)?u.href:null;}catch{return null;}};
function createSeuImporter(getMain,onResult){
 let task=null;
 const toolbarURL=pathToFileURL(path.join(__dirname,'seu-import.html')).href;
 const trusted=e=>task&&e.sender===task.window.webContents&&e.senderFrame?.url===toolbarURL;
 const tell=(text,error=false)=>{if(task&&!task.window.isDestroyed())task.window.webContents.send('seu-status',{text,error});};
 async function capture(){
  const t=task;if(!t||t.busy)return {ok:false,error:'请等待当前读取完成。'};t.busy=true;
  try{
   const frames=t.view.webContents.mainFrame.framesInSubtree.filter(f=>allowed(f.url)&&new URL(f.url).pathname.includes('/jwapp/'));
   const frame=frames.find(f=>new URL(f.url).pathname.includes('/wdkb'))||frames[0];
   if(!frame)throw new Error('请先完成学校登录，进入“我的课表”，再点击读取。');
   tell('正在读取所选学期，请稍候…');
   const payload=await frame.executeJavaScript(`(${async function(termCode){
     try{
     const read=async url=>{const r=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('读取失败，请检查学校登录状态。');const text=await r.text();try{return JSON.parse(text);}catch{throw new Error('登录可能已失效，请重新进入“我的课表”。');}};
     const data=await read('/jwapp/sys/wdkb/modules/jshkcb/xnxqcx.do'),terms=data?.datas?.xnxqcx?.rows;
     if(!Array.isArray(terms))throw new Error('学期列表读取失败，请确认已进入本科生“我的课表”。');
     const term=terms.find(t=>String(t.DM)===termCode);if(!term)throw new Error('找不到填写的学期编号，请关闭窗口并核对学期。');
     const result=await read('/jwapp/sys/wdkb/modules/xskcb/xskcb.do?XNXQDM='+encodeURIComponent(term.DM)),rows=result?.datas?.xskcb?.rows;
     if(!Array.isArray(rows)||!rows.length)throw new Error('所选学期没有课表记录，请核对学期和登录账户。');
     return {termCode:String(term.DM),termName:String(term.MC||term.DM),rows};
     }catch(e){return {error:String(e?.message||'学校课表读取失败，请重新登录后重试。')};}
   }.toString()})(${JSON.stringify(t.options.termCode)})`);
   if(task!==t||t.window.isDestroyed())return {ok:false,error:'抓取已取消。'};
   if(payload?.error)throw new Error(payload.error);
   const result=parseSeuCourses(payload,t.options);if(!result.events.length&&!result.skippedPast)throw new Error('没有识别出可导入的课程。'+result.errors.slice(0,3).join('；'));
   onResult(result);task=null;t.window.destroy();await t.session.clearStorageData().catch(()=>{});return {ok:true};
  }catch(e){if(task===t)tell(e.message||'抓取失败，请重试。',true);return {ok:false,error:e.message||'课表抓取失败。'};}finally{t.busy=false;}
 }
 ipcMain.handle('seu-capture',e=>trusted(e)?capture():{ok:false,error:'请求来源无效。'});
 ipcMain.on('seu-close',e=>{if(trusted(e))task.window.close();});
 async function open(input){
  input={...input,firstMonday:input?.firstMonday||semesterMondays[input?.termCode]};
  if(task&&!task.window.isDestroyed()){task.window.show();task.window.focus();throw new Error('学校登录窗口已打开，请在该窗口继续或关闭后重试。');}
  if(!/^\d{4}-\d{4}-[123]$/.test(input.termCode||''))throw new Error('请填写正确学期编号。');
  if(!D.validDate(input.firstMonday)||D.weekday(input.firstMonday)!==1)throw new Error('此学期尚无内置校历，请展开“校历日期校准”填写第 1 教学周周一。它只用于换算日期，抓取范围仍为整学期。');
  if(typeof input.account!=='string'||!input.account.trim()||input.account.length>80||typeof input.password!=='string'||!input.password||input.password.length>200)throw new Error('请填写学生账号和统一身份认证密码。');
  const area=screen.getPrimaryDisplay().workAreaSize,s=session.fromPartition('shixu-seu-'+Date.now(),{cache:false});
  s.setPermissionRequestHandler((_c,_p,cb)=>cb(false));s.setPermissionCheckHandler(()=>false);
  s.webRequest.onBeforeRequest((r,cb)=>{const secure=secureURL(r.url);if(secure&&secure!==r.url)return cb({redirectURL:secure});cb({cancel:!secure&&!r.url.startsWith('data:')&&!r.url.startsWith('blob:')&&r.url!=='about:blank'});});
  s.on('will-download',e=>e.preventDefault());
  const window=new BrowserWindow({width:Math.min(1060,area.width),height:Math.min(780,area.height),minWidth:Math.min(760,area.width),minHeight:Math.min(540,area.height),parent:getMain(),title:'东南大学 · 课表抓取',backgroundColor:'#101e30',webPreferences:{preload:path.join(__dirname,'seu-import-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const view=new WebContentsView({webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const t={window,view,session:s,options:{firstMonday:input.firstMonday,termCode:input.termCode},credentials:{account:input.account.trim(),password:input.password},busy:false,autoTried:false};task=t;
  window.contentView.addChildView(view);const resize=()=>{const [width,height]=window.getContentSize();view.setBounds({x:0,y:98,width,height:Math.max(0,height-98)});};window.on('resize',resize);resize();
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  view.webContents.setWindowOpenHandler(({url})=>{const secure=secureURL(url);if(secure)view.webContents.loadURL(secure).catch(()=>tell('学校页面打开失败，请检查校园网络。',true));return {action:'deny'};});
  view.webContents.on('will-navigate',(e,url)=>{const secure=secureURL(url);if(!secure)e.preventDefault();else if(secure!==url){e.preventDefault();view.webContents.loadURL(secure).catch(()=>tell('学校页面打开失败，请检查校园网络。',true));}});
  view.webContents.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)tell('无法连接学校网站，请检查校园网 / VPN 后重试。',true);});
  view.webContents.on('did-finish-load',async()=>{
   if(task!==t)return;const url=view.webContents.getURL();if(!allowed(url))return;
   tell('请完成学校登录与验证；进入“我的课表”后读取。');
   if(t.credentials&&new URL(url).pathname.includes('/authserver/')){
    const credentials=t.credentials;t.credentials=null;
    try{await view.webContents.executeJavaScript(`(${function(c){const user=document.querySelector('#username,input[name="username"]'),password=document.querySelector('#password,input[name="password"]');if(!user||!password)return;for(const [el,value] of [[user,c.account],[password,c.password]]){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}const captcha=[...document.querySelectorAll('input')].some(e=>/captcha|verifycode/i.test(e.name+' '+e.id)&&e.getClientRects().length);if(!captcha){const b=document.querySelector('#login_submit,#login_submit_btn,button[type="submit"],input[type="submit"]');b?.click();}}.toString()})(${JSON.stringify(credentials)})`);}catch{tell('请在学校页面中完成登录。');}
   }
   if(new URL(url).pathname.includes('/jwapp/sys/wdkb/')&&!t.autoTried){t.autoTried=true;await capture();}
  });
  window.on('closed',()=>{t.credentials=null;if(task===t){task=null;onResult({cancelled:true});}if(!view.webContents.isDestroyed())view.webContents.close();s.clearStorageData().catch(()=>{});});
  await window.loadFile(path.join(__dirname,'seu-import.html'));view.webContents.loadURL(ENTRY).catch(()=>tell('学校网站暂时无法打开，请检查校园网 / VPN。',true));return true;
 }
 return {open,cancel:()=>task?.window.close()};
}
module.exports={createSeuImporter,allowed};
