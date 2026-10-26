const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');
const { auditArchive } = require('../release-audit.cjs');
const files = require('../release-files.cjs');
const config = require('../electron-builder.cjs');

test('installer offers directory selection and retains user data on uninstall', () => {
  assert.equal(config.appId, 'local.shixu.desktop');
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
});
test('release auditing rejects private records, test fixtures and unexpected files in the real archive', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shixu-release-'));
  t.after(() => {
    assert.ok(path.isAbsolute(root) && root.startsWith(path.join(os.tmpdir(), 'shixu-release-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const input = path.join(root, 'app'), archive = path.join(root, 'app.asar');
  fs.mkdirSync(input);
  for (const file of files) fs.writeFileSync(path.join(input, file), 'release source');
  fs.writeFileSync(path.join(input, 'package.json'), JSON.stringify({ main: 'main.cjs', version: '0.7.0' }));
  await asar.createPackage(input, archive);
  assert.equal(auditArchive(archive).personalRecords, 0);
  for (const file of ['workspace.json', 'secrets.json', '.env', 'test/fixture.json']) {
    const target = path.join(input, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'must not ship');
    await asar.createPackage(input, archive);
    assert.throws(() => auditArchive(archive), /未经允许|混入安装包/);
    fs.unlinkSync(target);
    if (file.startsWith('test/')) fs.rmdirSync(path.dirname(target));
  }
});
