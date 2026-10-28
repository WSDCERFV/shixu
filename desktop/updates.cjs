const fs=require('node:fs'),crypto=require('node:crypto');
const RELEASES='https://github.com/WSDCERFV/shixu/releases';
const LATEST='https://api.github.com/repos/WSDCERFV/shixu/releases/latest';
function versionParts(value){const m=String(value||'').match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/);if(!m||m.slice(1,4).some(s=>!Number.isSafeInteger(Number(s))))throw new Error('版本号格式不正确。');return m.slice(1,4).map(Number);}
function compare(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
async function readResponse(response){
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1000000)throw new Error('更新信息异常，已停止检查。');text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
}
async function publicRelease(request,signal){
 const page=await request(RELEASES+'/latest',{redirect:'manual',signal});await page.body?.cancel();if(page.status===404)return null;
 if(![301,302,303,307,308].includes(page.status))throw new Error('更新服务器暂时不可用，请稍后重试。');
 const location=page.headers.get('location')||'',prefix=RELEASES+'/tag/';if(!location.startsWith(prefix))throw new Error('更新信息不属于时序官方仓库，已停止检查。');
 const tag=decodeURIComponent(location.slice(prefix.length));versionParts(tag);if(location!==prefix+encodeURIComponent(tag))throw new Error('更新信息异常，已停止检查。');
 const manifest=await request(RELEASES+'/download/'+encodeURIComponent(tag)+'/latest.yml',{redirect:'follow',signal});let hasManifest=false;
 if(manifest.ok){const info=require('js-yaml').load(await readResponse(manifest));if(info?.version!==tag.replace(/^v/,''))throw new Error('更新清单版本不一致，请稍后重试。');hasManifest=true;}
 else {await manifest.body?.cancel();if(manifest.status!==404)throw new Error('更新清单暂时无法读取，请稍后重试。');}
 return {tag_name:tag,html_url:location,draft:false,prerelease:false,body:'已通过官方发布页检查版本。完整更新内容请点击“官方发布页”查看。',assets:hasManifest?[{name:'latest.yml',state:'uploaded'}]:[]};
}
async function fetchRelease({signal,request=fetch}={}){
 let response;try{response=await request(LATEST,{headers:{Accept:'application/vnd.github+json','User-Agent':'Shixu-update-check'},redirect:'error',signal});}catch(error){if(signal?.aborted)throw error;return publicRelease(request,signal);}
 if(response.status===404){await response.body?.cancel();return null;}
 if(!response.ok){await response.body?.cancel();return publicRelease(request,signal);}
 return JSON.parse(await readResponse(response));
}
function releaseInfo(raw){
 if(!raw)return null;if(raw.draft||raw.prerelease)throw new Error('更新源没有可用的正式版本。');versionParts(raw.tag_name);
 const tag=String(raw.tag_name),url=RELEASES+'/tag/'+encodeURIComponent(tag);
 if(raw.html_url!==url)throw new Error('更新信息不属于时序官方仓库，已停止检查。');
 const manifest=(raw.assets||[]).some(a=>a.name==='latest.yml'&&a.state==='uploaded');
 return {version:tag.replace(/^v/,''),url,hasManifest:manifest,notes:String(raw.body||'').slice(0,12000),publishedAt:raw.published_at||''};
}
function friendly(error){const code=String(error?.code||''),message=String(error?.message||'');if(/ENOSPC|磁盘空间/.test(code+' '+message))return '磁盘空间不足，下载未完成；清理空间后可重试。';if(/sha512|checksum|INVALID_SIGNATURE|校验/.test(code+' '+message))return '更新包校验未通过，已停止安装；请重新检查并下载。';if(/Timeout|timed out|超时/.test(message+' '+code))return '更新连接超时，请检查网络后重试，原版本和个人记录保留。';if(/GitHub|版本|更新源|更新信息|未发布|未准备|下载|安装|本地记录|更新服务器/.test(message)&&message.length<250)return message;return '更新操作未完成，请检查网络或稍后重试；也可从官方发布页下载新版覆盖安装。';}
async function verifyFile(file,info){
 const meta=(info.files||[]).find(x=>/\.exe$/i.test(String(x.url||'').split('?')[0]));
 if(!meta||typeof meta.sha512!=='string'||!meta.sha512)throw new Error('更新包缺少校验信息，已停止安装。');
 const stat=await fs.promises.stat(file);if(!stat.isFile()||(meta.size&&meta.size!==stat.size))throw new Error('更新包大小校验失败，请重新下载。');
 const hash=crypto.createHash('sha512');for await(const part of fs.createReadStream(file))hash.update(part);if(hash.digest('base64')!==meta.sha512)throw new Error('更新包校验未通过，已停止安装。');
}
function createUpdateControl({currentVersion,mode='installed',getUpdater,makeToken,loadRelease=fetchRelease,onChange=()=>{},checkTimeoutMs=20000,downloadTimeoutMs=1800000,verify=verifyFile}){
 versionParts(currentVersion);
 let state={currentVersion,mode,stage:'idle',latestVersion:'',checkedAt:'',notes:'',releaseURL:RELEASES,canDownload:false,percent:0,transferred:0,total:0,message:'点击检查更新，下载和安装均由你手动决定。'},updater,active=null,downloaded=null,downloadInfo=null,installInvoked=false;
 const status=()=>({...state});
 const change=value=>{state={...state,...value};onChange(status());return status();};
 function client(){if(updater)return updater;const current=getUpdater();updater=current;updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.disableWebInstaller=true;updater.disableDifferentialDownload=true;updater.logger=null;
  updater.on('error',error=>{if(updater===current&&state.stage==='installing')change({stage:'error',message:friendly(error)});});
  updater.on('download-progress',p=>{if(updater!==current||active?.kind!=='download'||active.cancelled)return;change({stage:'downloading',percent:Math.max(0,Math.min(100,Number(p.percent)||0)),transferred:Math.max(0,Number(p.transferred)||0),total:Math.max(0,Number(p.total)||0),message:'正在下载更新，完成后会校验文件。'});});return updater;
 }
 async function check(){
  if(active||state.stage==='installing'||state.stage==='downloaded')return status();
  const operation={kind:'check',controller:new AbortController()};active=operation;const timer=setTimeout(()=>operation.controller.abort(),checkTimeoutMs);
  change({stage:'checking',message:'正在检查 GitHub 上的正式版本…',percent:0,canDownload:false});
  try{const release=releaseInfo(await loadRelease({signal:operation.controller.signal}));if(operation.controller.signal.aborted)throw new Error('更新连接超时。');
   if(!release)return change({stage:'unpublished',checkedAt:new Date().toISOString(),message:'仓库还没有正式发布版本，请稍后检查。'});
   const newer=compare(release.version,currentVersion),canDownload=newer>0&&mode==='installed'&&release.hasManifest;
   return change({stage:newer>0?'available':newer<0?'ahead':'current',latestVersion:release.version,releaseURL:release.url,notes:release.notes,checkedAt:new Date().toISOString(),canDownload,message:newer<0?'本机版本高于当前公开版本，暂无需要安装的更新。':newer===0?'当前已是最新公开版本。':canDownload?'发现新版本，可下载后保存并退出安装。':mode==='preview'?'发现新版本。免安装版请从发布页下载完整 ZIP，并保留原“预览数据”。':mode==='development'?'发现新版本；开发或隔离环境只检查版本，不执行覆盖安装。':'发现新版本，但发布页缺少自动更新文件，请从发布页下载安装包覆盖升级。'});
  }catch(error){return change({stage:'error',message:operation.controller.signal.aborted?'更新连接超时，请检查网络后重试。':friendly(error)});}finally{clearTimeout(timer);if(active===operation)active=null;}
 }
 async function download(){
  if(active)return status();if(state.stage!=='available'||!state.canDownload)throw new Error('当前没有可下载的自动更新，请先检查版本。');
  const u=client(),operation={kind:'download',token:makeToken(),cancelled:false};active=operation;let expired=false;
  const cancelled=new Promise((_resolve,reject)=>operation.reject=reject),wait=promise=>Promise.race([promise,cancelled]);
  operation.abort=()=>{operation.token.cancel();try{u.netSession?.closeAllConnections().catch(()=>{});}catch{}operation.reject(new Error('更新连接已停止。'));};
  const timer=setTimeout(()=>{expired=true;operation.abort();},downloadTimeoutMs);
  const manifestTimer=setTimeout(()=>{expired=true;operation.abort();},checkTimeoutMs);
  change({stage:'downloading',percent:0,transferred:0,total:0,message:'正在读取并校验更新清单…'});
  try{const checked=await wait(u.checkForUpdates());clearTimeout(manifestTimer);if(operation.cancelled)throw new Error('已取消下载。');
   if(!checked?.updateInfo||compare(checked.updateInfo.version,currentVersion)<=0)throw new Error('更新清单尚未准备好，请重新检查或使用发布页安装包。');
   if(checked.updateInfo.version!==state.latestVersion)throw new Error('发布版本已经变化，请重新检查更新。');
   const files=await wait(u.downloadUpdate(operation.token));if(operation.cancelled||expired)throw new Error('下载未完成。');
   if(!files?.[0])throw new Error('更新包下载未完成，请重试。');await verify(files[0],checked.updateInfo);if(operation.cancelled||expired)throw new Error('下载未完成。');
   downloaded=files[0];downloadInfo=checked.updateInfo;installInvoked=false;return change({stage:'downloaded',percent:100,message:'更新包已下载并通过校验，点击后将先保存记录，再退出安装。'});
  }catch(error){downloaded=null;downloadInfo=null;if(operation.cancelled||expired)updater=null;return change({stage:operation.cancelled?'available':'error',message:operation.cancelled?'已取消下载，原版本继续使用。':expired?'更新连接等待超时，可重新检查后重试。':friendly(error)});}finally{clearTimeout(timer);clearTimeout(manifestTimer);if(active===operation)active=null;}
 }
 function cancel(){if(active?.kind==='download'){active.cancelled=true;active.abort();change({message:'正在取消下载…'});}return status();}
 async function prepareInstall(){if(active||mode!=='installed'||state.stage!=='downloaded'||!downloaded)throw new Error('更新包尚未准备好，当前不会退出应用。');active={kind:'install'};try{await verify(downloaded,downloadInfo);return change({stage:'installing',message:'记录已保存，正在退出并启动升级安装…'});}catch(error){change({stage:'error',message:friendly(error)});throw new Error(friendly(error));}finally{active=null;}}
 function install(){if(state.stage!=='installing'||installInvoked)throw new Error('更新包尚未准备好或安装已开始。');installInvoked=true;try{client().quitAndInstall(true,true);}catch(error){change({stage:'error',message:friendly(error)});throw error;}return status();}
 function dispose(){if(active?.controller)active.controller.abort();if(active?.abort){active.cancelled=true;active.abort();}}
 return {status,check,download,cancel,prepareInstall,install,dispose};
}
module.exports={createUpdateControl,fetchRelease,releaseInfo,compare,verifyFile,RELEASES};
