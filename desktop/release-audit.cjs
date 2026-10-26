const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const files = require('./release-files.cjs');
function auditArchive(archive) {
  asar.uncache(archive);
  const entries = asar.listPackage(archive).map(n => n.replaceAll('\\', '/').replace(/^\//, ''));
  const allowed = new Set([...files, 'package.json']);
  for (const name of entries) {
    assert.ok(allowed.has(name) || name === 'node_modules' || name === 'node_modules/nodemailer' || name.startsWith('node_modules/nodemailer/'), '未经允许的安装内容：' + name);
    assert.ok(!/(^|\/)(workspace|secrets|mailbox|mail-log)\.json($|\.)|(^|\/)(test|tests|work|outputs|\.env)(\/|$)/i.test(name), '个人记录或测试文件混入安装包：' + name);
  }
  for (const name of allowed) assert.ok(entries.includes(name), '安装包缺少文件：' + name);
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
