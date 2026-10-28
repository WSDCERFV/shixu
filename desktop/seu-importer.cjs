const {BrowserWindow,WebContentsView,session,screen,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parseSeuCourses,normalizeTerms}=require('./seu-courses.cjs');
const {fillSchoolLogin,readSchoolTerms,readSchoolCourses}=require('./seu-page.cjs');
const D=require('./planner-domain.cjs');
const ENTRY='https://ehall.seu.edu.cn/appShow?appId=4770397878132218';
const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='seu.edu.cn'||u.hostname.endsWith('.seu.edu.cn'))&&!u.username&&!u.password;}catch{return false;}};
const secureURL=url=>{try{const u=new URL(url);if(u.protocol==='http:')u.protocol='https:';return allowed(u.href)?u.href:null;}catch{return null;}};
const courseFrame=t=>t.view.webContents.mainFrame.framesInSubtree.find(f=>allowed(f.url)&&new URL(f.url).pathname.includes('/jwapp/sys/wdkb/'));
function createSeuImporter(getMain,onResult){
 let task=null;
 const toolbarURL=pathToFileURL(path.join(__dirname,'seu-import.html')).href;
 const trusted=e=>task&&e.sender===task.window.webContents&&e.senderFrame?.url===toolbarURL;
 const tell=(text,error=false)=>{if(task&&!task.window.isDestroyed())task.window.webContents.send('seu-status',{text,error});};
 const run=(frame,fn,...args)=>frame.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
 async function discover(t,force=false){
  if(task!==t||t.window.isDestroyed()||t.termsBusy||t.busy||(!force&&(t.termsReady||Date.now()<t.nextTermTry)))return;
  const frame=courseFrame(t);if(!frame)return;
  t.credentials=null;t.termsBusy=true;t.nextTermTry=Date.now()+10000;
  try{
   tell('已进入本科生“我的课表”，正在读取学校的学期列表…');
   const data=await run(frame,readSchoolTerms);if(task!==t)return;if(data?.error)throw new Error(data.error);
   t.terms=normalizeTerms(data?.rows);t.termsReady=true;
   t.window.webContents.send('seu-terms',{terms:t.terms,lastTerm:t.lastTerm});
   tell('请选择学校返回的学期名称，核对日期后点击读取。不会自动抓取默认学期。');
  }catch(e){if(task===t)tell(e.message,true);}finally{t.termsBusy=false;}
 }
 async function capture(input){
  const t=task;if(!t||t.busy)return {ok:false,error:'请等待当前读取完成。'};
  const term=t.terms.find(x=>x.code===input?.termCode);
  if(!term||input?.confirmed!==true)return {ok:false,error:'请先从学校列表选择学期，并勾选确认学期。'};
  if(!D.validDate(input.firstMonday)||D.weekday(input.firstMonday)!==1)return {ok:false,error:'请按所选学期的校历填写第一教学周周一。'};
  if(term.summer&&input.summerConfirmed!==true)return {ok:false,error:'当前选择的是暑期或短学期，请明确确认后再读取。'};
  t.busy=true;
  try{
   const frame=courseFrame(t);if(!frame)throw new Error('请先完成学校登录，进入本科生“我的课表”再读取。');
   tell('正在读取 '+term.name+' 的整学期课表，已结束课程将略过…');
   const payload=await run(frame,readSchoolCourses,term.code);
   if(task!==t||t.window.isDestroyed())return {ok:false,error:'抓取已取消。'};
   if(payload?.error)throw new Error(payload.error);
   if(payload.termCode!==term.code||payload.termName!==term.name)throw new Error('学校返回的学期信息发生变化，请刷新学期列表重新确认。');
   const result=parseSeuCourses(payload,{firstMonday:input.firstMonday,excludeEnded:true});
   if(!result.events.length&&!result.skippedPast)throw new Error('没有识别出可导入的课程。'+result.errors.slice(0,3).join('；'));
   onResult(result);task=null;t.window.destroy();return {ok:true};
  }catch(e){if(task===t)tell(e.message||'抓取失败，请重试。',true);return {ok:false,error:e.message||'课表抓取失败。'};}finally{t.busy=false;}
 }
 ipcMain.handle('seu-capture',(e,input)=>trusted(e)?capture(input):{ok:false,error:'请求来源无效。'});
 ipcMain.handle('seu-refresh',async e=>{if(!trusted(e))return {ok:false};task.termsReady=false;await discover(task,true);return {ok:true};});
 ipcMain.on('seu-close',e=>{if(trusted(e))task.window.close();});
 async function open(input){
  if(task&&!task.window.isDestroyed()){task.window.show();task.window.focus();throw new Error('学校登录窗口已打开，请在该窗口继续或关闭后重试。');}
  if(typeof input?.account!=='string'||!input.account.trim()||input.account.length>80||typeof input.password!=='string'||!input.password||input.password.length>200)throw new Error('请填写学生账号和统一身份认证密码。');
  const area=screen.getPrimaryDisplay().workAreaSize,s=session.fromPartition('shixu-seu-'+Date.now(),{cache:false});
  s.setPermissionRequestHandler((_c,_p,cb)=>cb(false));s.setPermissionCheckHandler(()=>false);
  s.webRequest.onBeforeRequest((r,cb)=>{const secure=secureURL(r.url);if(secure&&secure!==r.url)return cb({redirectURL:secure});cb({cancel:!secure&&!r.url.startsWith('data:')&&!r.url.startsWith('blob:')&&r.url!=='about:blank'});});
  s.on('will-download',e=>e.preventDefault());
  const window=new BrowserWindow({width:Math.min(1100,area.width),height:Math.min(850,area.height),minWidth:Math.min(760,area.width),minHeight:Math.min(600,area.height),parent:getMain(),title:'东南大学 · 登录并选择学期',backgroundColor:'#101e30',webPreferences:{preload:path.join(__dirname,'seu-import-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const view=new WebContentsView({webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const t={window,view,session:s,lastTerm:String(input.termCode||'').slice(0,80),credentials:{account:input.account.trim(),password:input.password},busy:false,terms:[],termsReady:false,termsBusy:false,nextTermTry:0,loginBusy:false,submitted:false};task=t;
  window.contentView.addChildView(view);const resize=()=>{const [width,height]=window.getContentSize();view.setBounds({x:0,y:230,width,height:Math.max(0,height-230)});};window.on('resize',resize);resize();
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  view.webContents.setWindowOpenHandler(({url})=>{const secure=secureURL(url);if(secure)view.webContents.loadURL(secure).catch(()=>tell('学校页面打开失败，请检查校园网络。',true));return {action:'deny'};});
  view.webContents.on('will-navigate',(e,url)=>{const secure=secureURL(url);if(!secure)e.preventDefault();else if(secure!==url){e.preventDefault();view.webContents.loadURL(secure).catch(()=>tell('学校页面打开失败，请检查校园网络。',true));}});
  view.webContents.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)tell('无法连接学校网站，请检查校园网 / VPN 后重试。',true);});
  const poll=async()=>{
   if(task!==t||window.isDestroyed()||view.webContents.isDestroyed())return;
   try{
    if(t.credentials&&!t.loginBusy){
     const frames=view.webContents.mainFrame.framesInSubtree.filter(f=>{if(!allowed(f.url))return false;const u=new URL(f.url);return /authserver|\/portal\/|\/cas\//.test(u.pathname)||/^(?:newids|auth|vpn|ids|cas)\.seu\.edu\.cn$/.test(u.hostname);});
     t.loginBusy=true;try{for(const frame of frames){const info=await run(frame,fillSchoolLogin,t.credentials,!t.submitted);if(task!==t)return;if(info.submitted)t.submitted=true;if(info.filled)tell(info.captcha?'账号密码已填入，请只完成验证码或验证操作。':info.submitted?'账号密码已填入并提交，正在等待学校验证…':'账号密码已填入，请核对后在学校页面继续登录。');}}finally{t.loginBusy=false;}
    }
    await discover(t);
   }catch{/* A navigating frame can disappear; retry once the next document is ready. */}
  };
  const timer=setInterval(poll,800);view.webContents.on('dom-ready',poll);view.webContents.on('did-frame-finish-load',poll);
  window.on('closed',()=>{clearInterval(timer);t.credentials=null;if(task===t){task=null;onResult({cancelled:true});}if(!view.webContents.isDestroyed())view.webContents.close();s.clearStorageData().catch(()=>{});s.clearAuthCache().catch(()=>{});});
  try{await window.loadFile(path.join(__dirname,'seu-import.html'));view.webContents.loadURL(ENTRY).catch(()=>tell('学校网站暂时无法打开，请检查校园网 / VPN。',true));return true;}
  catch(e){window.destroy();throw e;}
 }
 return {open,cancel:()=>task?.window.close()};
}
module.exports={createSeuImporter,allowed};
