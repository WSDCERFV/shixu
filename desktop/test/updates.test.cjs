const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createUpdateControl,fetchRelease,releaseInfo,compare,verifyFile}=require('../updates.cjs');
const release=(v='0.8.4',manifest=true)=>({tag_name:'v'+v,html_url:'https://github.com/WSDCERFV/shixu/releases/tag/v'+v,body:'更新内容',draft:false,prerelease:false,assets:manifest?[{name:'latest.yml',state:'uploaded'}]:[]});
class MockUpdater extends EventEmitter{constructor(){super();this.checks=0;this.downloads=0;this.installs=[];this.info={version:'0.8.4'};}async checkForUpdates(){this.checks++;return {updateInfo:this.info};}async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:46,total:100,transferred:46});return ['fixture.exe'];}quitAndInstall(...args){this.installs.push(args);}}
function setup(options={}){const updater=new MockUpdater(),changes=[];let lookups=0;const control=createUpdateControl({currentVersion:'0.8.3',mode:'installed',getUpdater:()=>updater,makeToken:()=>({cancel(){this.cancelled=true;}}),loadRelease:async()=>{lookups++;return release();},verify:async()=>{},onChange:s=>changes.push(s),...options});return {control,updater,changes,lookups:()=>lookups};}
test('update checks are opt-in, compare numeric versions, and never enable automatic download or downgrade',async()=>{
 assert.equal(compare('0.10.0','0.9.9'),1);assert.equal(compare('v1.0.0','1.0.0'),0);assert.throws(()=>compare('1.0.0-beta','1.0.0'));
 const {control,updater,lookups}=setup();assert.equal(lookups(),0);assert.equal(updater.checks,0);assert.equal((await control.check()).stage,'available');assert.equal(updater.downloads,0);
 await control.download();assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);assert.equal(updater.installs.length,0);
 await control.prepareInstall();control.install();assert.deepEqual(updater.installs,[[true,true]]);assert.throws(()=>control.install(),/已开始/);
});
test('current, locally newer, portable, development and missing-manifest releases have accurate actions',async()=>{
 for(const [options,stage,canDownload] of [[{loadRelease:async()=>release('0.8.3')},'current',false],[{loadRelease:async()=>release('0.8.0')},'ahead',false],[{mode:'preview'},'available',false],[{mode:'development'},'available',false],[{loadRelease:async()=>release('0.8.4',false)},'available',false]]){const {control,updater}=setup(options);const status=await control.check();assert.equal(status.stage,stage);assert.equal(status.canDownload,canDownload);await assert.rejects(control.download(),/先检查|没有可下载/);assert.equal(updater.downloads,0);}
 assert.equal((await setup({loadRelease:async()=>null}).control.check()).stage,'unpublished');
});
test('wrong repository, draft and prerelease data are rejected rather than used as download locations',()=>{
 for(const value of [{...release(),html_url:'https://example.com/malware'},{...release(),draft:true},{...release(),prerelease:true},{...release(),tag_name:'v../../bad'}])assert.throws(()=>releaseInfo(value));
});
test('GitHub API limits fall back to the official release redirect and matching update manifest',async()=>{
 const calls=[],request=async(url)=>{calls.push(url);if(url.includes('api.github.com'))return new Response('',{status:403});if(url.endsWith('/latest'))return new Response('',{status:302,headers:{location:release().html_url}});return new Response('version: 0.8.4\nfiles: []');};
 const info=releaseInfo(await fetchRelease({request}));assert.equal(info.version,'0.8.4');assert.equal(info.hasManifest,true);assert.equal(calls.length,3);
 const old=releaseInfo(await fetchRelease({request:async url=>url.includes('/download/')?new Response('',{status:404}):request(url)}));assert.equal(old.hasManifest,false);
 await assert.rejects(fetchRelease({request:async url=>url.includes('api.github.com')?new Response('',{status:429}):new Response('',{status:302,headers:{location:'https://github.com/other/app/releases/tag/v0.8.4'}})}),/官方仓库/);
 await assert.rejects(fetchRelease({request:async url=>url.includes('/download/')?new Response('version: 0.8.2'):request(url)}),/版本不一致/);
});
test('repeated checks coalesce and offline failures remain retryable',async()=>{
 let unblock,calls=0;const {control}=setup({loadRelease:()=>{calls++;return new Promise(r=>unblock=r);}});const pending=control.check();await control.check();assert.equal(calls,1);unblock(release());await pending;assert.equal(control.status().stage,'available');
 let fail=true;const another=setup({loadRelease:async()=>{if(fail)throw new Error('network unavailable');return release();}}).control;assert.equal((await another.check()).stage,'error');fail=false;assert.equal((await another.check()).stage,'available');
});
test('cancelling a stalled metadata request returns promptly and never enables installation',async()=>{
 const {control,updater}=setup();updater.checkForUpdates=()=>new Promise(()=>{});await control.check();const pending=control.download();control.cancel();await pending;assert.equal(control.status().stage,'available');assert.equal(updater.downloads,0);await assert.rejects(control.prepareInstall(),/未准备/);
});
test('download timeouts and checksum failures leave the installed application untouched',async()=>{
 const one=setup({checkTimeoutMs:20});one.updater.checkForUpdates=()=>new Promise(()=>{});await one.control.check();assert.equal((await one.control.download()).stage,'error');assert.match(one.control.status().message,/超时/);assert.equal(one.updater.installs.length,0);
 const two=setup({verify:async()=>{throw new Error('更新包校验未通过。');}});await two.control.check();assert.equal((await two.control.download()).stage,'error');await assert.rejects(two.control.prepareInstall(),/未准备/);assert.equal(two.updater.installs.length,0);
});
test('download progress is reported, and the cached file is verified again before an install',async()=>{
 let validations=0;const {control,changes,updater}=setup({verify:async()=>{validations++;if(validations===2)throw new Error('更新包校验未通过。');}});await control.check();await control.download();assert.ok(changes.some(s=>s.percent===46));assert.equal(control.status().stage,'downloaded');await assert.rejects(control.prepareInstall(),/校验/);assert.equal(validations,2);assert.equal(updater.installs.length,0);
});
test('real SHA-512 verification rejects a missing, altered or wrongly sized downloaded installer',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shixu-update-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'fixture.exe'),bytes=Buffer.from('not an executable, test data only');await fs.writeFile(file,bytes);const info={files:[{url:'Shixu-0.8.4-setup-x64.exe',size:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('base64')}]};await verifyFile(file,info);await fs.appendFile(file,'modified');await assert.rejects(verifyFile(file,info),/校验/);await assert.rejects(verifyFile(file,{files:[]}),/缺少校验/);
});
