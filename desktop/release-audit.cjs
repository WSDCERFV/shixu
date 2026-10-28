const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const files = require('./release-files.cjs');
const runtime = require('./runtime-dependencies.cjs').runtimePackages();
// electron-builder may hoist a nested dependency when it has no version conflict.
const locations=p=>[...new Set([p.relative,'node_modules/'+p.name])];
const runtimeRoots=runtime.flatMap(locations);
function auditArchive(archive) {
  asar.uncache(archive);
  const entries = asar.listPackage(archive).map(n => n.replaceAll('\\', '/').replace(/^\//, ''));
  const allowed = new Set([...files, 'package.json']);
  const directories = new Set([...allowed].flatMap(file => { const parts=file.split('/');return parts.slice(0,-1).map((_part,i)=>parts.slice(0,i+1).join('/')); }));
  for (const name of entries) {
    assert.ok(allowed.has(name) || directories.has(name) || name === 'node_modules' || runtimeRoots.some(root=>name===root||name.startsWith(root+'/')), '未经允许的安装内容：' + name);
    assert.ok(!/(^|\/)(workspace|secrets|mailbox|mail-log)\.json($|\.)|(^|\/)(test|tests|work|outputs|\.env)(\/|$)/i.test(name), '个人记录或测试文件混入安装包：' + name);
  }
  for (const name of allowed) assert.ok(entries.includes(name), '安装包缺少文件：' + name);
  for(const p of runtime){const found=locations(p).filter(root=>entries.includes(root+'/package.json'));assert.ok(found.length,'安装包缺少运行依赖：'+p.name);for(const root of found){const info=JSON.parse(asar.extractFile(archive,path.join(root,'package.json')).toString());assert.equal(info.name,p.name,'运行依赖名称不一致：'+root);assert.equal(info.version,p.version,'运行依赖版本不一致：'+p.name);}}
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(metadata.main, 'main.cjs');
  return { version: metadata.version, fileCount: entries.length, personalRecords: 0, testFiles: 0 };
}
async function afterPack(context) {
  const archive = path.join(context.appOutDir, 'resources', 'app.asar');
  const result = auditArchive(archive);
  fs.writeFileSync(path.join(context.outDir, '安装内容检查.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('安装内容检查通过：仅包含应用文件，无个人记录或测试文件。');
}
module.exports = { auditArchive, afterPack };
