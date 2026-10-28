const fs=require('node:fs'),path=require('node:path');
const version=require('./package.json').version,name='时序免安装预览-'+version;
const output=path.resolve(__dirname,'../outputs',name),app=path.join(output,'resources','app');
if(fs.existsSync(output))throw new Error('预览目录已经存在；请使用新版本目录，避免覆盖个人预览数据。');
fs.cpSync(path.join(__dirname,'node_modules/electron/dist'),output,{recursive:true});
fs.renameSync(path.join(output,'electron.exe'),path.join(output,'时序预览.exe'));
fs.mkdirSync(app,{recursive:true});
for(const file of [...require('./release-files.cjs'),'preview-main.cjs']){fs.mkdirSync(path.dirname(path.join(app,file)),{recursive:true});fs.copyFileSync(path.join(__dirname,file),path.join(app,file));}
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'shixu-preview',version,main:'preview-main.cjs'}));
require('./runtime-dependencies.cjs').copyRuntimePackages(app);
const renderer=path.join(app,'renderer.html');
fs.writeFileSync(renderer,fs.readFileSync(renderer,'utf8').replace('时序 · 把想做的事，放进时间里','时序 · 免安装预览'));
fs.copyFileSync(path.join(__dirname,'预览版说明.md'),path.join(output,'先读我.md'));
fs.copyFileSync(path.join(__dirname,'../THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
fs.cpSync(path.join(__dirname,'../docs/licenses'),path.join(output,'licenses'),{recursive:true});
if(fs.existsSync(path.join(__dirname,'../LICENSE')))fs.copyFileSync(path.join(__dirname,'../LICENSE'),path.join(output,'LICENSE.txt'));
console.log(path.join(output,'时序预览.exe'));
