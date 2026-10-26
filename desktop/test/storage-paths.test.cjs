const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveStoragePaths, prepareStoragePaths, configureStoragePaths } = require('../storage-paths.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shixu-paths-'));
  t.after(() => {
    assert.ok(path.isAbsolute(root) && root.startsWith(path.join(os.tmpdir(), 'shixu-paths-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
test('upgrades keep the established records separate from local cache, crash dumps and temp files', t => {
  const root = fixture(t), options = { appData: path.join(root, '漫游 数据'), localAppData: path.join(root, '本机 数据'), temp: path.join(root, '临时 文件') };
  const paths = resolveStoragePaths(options);
  assert.equal(paths.userData, path.join(options.appData, 'Shixu'));
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.writeFileSync(path.join(paths.userData, 'workspace.json'), 'existing user record');
  prepareStoragePaths(paths);
  assert.equal(fs.readFileSync(path.join(paths.userData, 'workspace.json'), 'utf8'), 'existing user record');
  for (const [name, directory] of Object.entries(paths)) {
    assert.ok(path.isAbsolute(directory));
    if (name !== 'userData') assert.ok(!directory.startsWith(paths.userData + path.sep));
    assert.ok(!fs.readdirSync(directory).some(n => n.startsWith('.write-check-')));
  }
});
test('isolated testing redirects every application data path away from the real Windows profile', t => {
  const root = fixture(t), override = path.join(root, '中文 测试目录');
  const applied = {};
  configureStoragePaths({ getPath: name => path.join(root, 'do-not-use', name), setPath: (name, value) => { applied[name] = value; } }, { SHIXU_DATA_DIR: override });
  assert.equal(applied.userData, override);
  for (const directory of Object.values(applied)) assert.ok(directory === override || directory.startsWith(override + path.sep));
  assert.ok(!fs.existsSync(path.join(root, 'do-not-use')));
});
test('relative or inaccessible data directories fail explicitly without falling back to another profile', t => {
  const root = fixture(t);
  assert.throws(() => resolveStoragePaths({ override: './test-data' }), /绝对路径/);
  const blocked = path.join(root, 'blocked');
  fs.writeFileSync(blocked, 'keep');
  assert.throws(() => prepareStoragePaths({ userData: path.join(blocked, 'data') }), /无法使用目录/);
  assert.equal(fs.readFileSync(blocked, 'utf8'), 'keep');
});
