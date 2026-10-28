const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),yaml=require('js-yaml');
function inspectRelease(directory,version){
 const info=yaml.load(fs.readFileSync(path.join(directory,'latest.yml'),'utf8'));
 if(!info||info.version!==version||!Array.isArray(info.files))throw new Error('自动更新清单版本与源码不一致。');
 const installer=info.files.find(f=>typeof f.url==='string'&&f.url.endsWith('-x64.exe'));
 if(!installer||path.basename(installer.url)!==installer.url||!installer.sha512)throw new Error('自动更新清单缺少有效的 x64 安装包。');
 const target=path.join(directory,installer.url),bytes=fs.readFileSync(target);
 if(installer.size!==bytes.length||crypto.createHash('sha512').update(bytes).digest('base64')!==installer.sha512)throw new Error('自动更新清单与安装包校验不一致。');
 if(!fs.existsSync(target+'.blockmap'))throw new Error('缺少安装包 blockmap。');
 return {version,installer:installer.url,size:bytes.length,manifest:'latest.yml',verified:true};
}
if(require.main===module){const version=require('./package.json').version;console.log(JSON.stringify(inspectRelease(path.resolve(__dirname,'../outputs/时序安装包-'+version),version)));}
module.exports={inspectRelease};
