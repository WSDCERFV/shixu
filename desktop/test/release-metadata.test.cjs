const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {inspectRelease}=require('../release-metadata.cjs');
test('release manifest matches the installer, version and required blockmap',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-manifest-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const bytes=Buffer.from('release fixture only'),filename='时序-0.8.3-安装程序-x64.exe';fs.writeFileSync(path.join(directory,filename),bytes);fs.writeFileSync(path.join(directory,filename+'.blockmap'),'fixture');
 const info={version:'0.8.3',files:[{url:filename,size:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('base64')}]};
 const save=()=>fs.writeFileSync(path.join(directory,'latest.yml'),JSON.stringify(info));save();assert.equal(inspectRelease(directory,'0.8.3').verified,true);
 assert.throws(()=>inspectRelease(directory,'0.8.4'),/版本/);info.files[0].url='../outside-x64.exe';save();assert.throws(()=>inspectRelease(directory,'0.8.3'),/有效/);
 info.files[0].url=filename;save();fs.appendFileSync(path.join(directory,filename),'tampered');assert.throws(()=>inspectRelease(directory,'0.8.3'),/校验/);
 fs.writeFileSync(path.join(directory,filename),bytes);fs.unlinkSync(path.join(directory,filename+'.blockmap'));assert.throws(()=>inspectRelease(directory,'0.8.3'),/blockmap/);
});
