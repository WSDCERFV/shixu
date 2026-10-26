const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function absolute(value, label) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value) || value.includes('\0')) throw new Error(label + '必须是完整的绝对路径。');
  return path.normalize(value);
}
function resolveStoragePaths({ appData, localAppData, temp, override }) {
  // Keep the established data directory across upgrades and installation moves.
  const userData = override ? absolute(override, '测试数据目录') : path.join(absolute(appData, '用户数据目录'), 'Shixu');
  const runtime = override ? path.join(userData, '.runtime') : path.join(absolute(localAppData, '本机数据目录'), 'Shixu');
  return {
    userData,
    sessionData: path.join(runtime, 'Cache'),
    logs: path.join(runtime, 'Logs'),
    crashDumps: path.join(runtime, 'CrashDumps'),
    temp: override ? path.join(runtime, 'Temp') : path.join(absolute(temp, '系统临时目录'), 'Shixu')
  };
}
function prepareStoragePaths(paths) {
  for (const directory of new Set(Object.values(paths))) {
    let probe;
    try {
      fs.mkdirSync(directory, { recursive: true });
      probe = path.join(directory, '.write-check-' + crypto.randomUUID());
      fs.writeFileSync(probe, '', { flag: 'wx', mode: 0o600 });
      fs.unlinkSync(probe);
      probe = null;
    } catch (error) {
      if (probe) { try { fs.unlinkSync(probe); } catch {} }
      throw new Error('无法使用目录：' + directory + '\n请检查剩余空间与当前 Windows 用户的读写权限。\n' + error.message, { cause: error });
    }
  }
  return paths;
}
function configureStoragePaths(app, env = process.env) {
  const paths = prepareStoragePaths(resolveStoragePaths({
    appData: app.getPath('appData'),
    localAppData: env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'),
    temp: app.getPath('temp'),
    override: env.SHIXU_DATA_DIR
  }));
  for (const [name, directory] of Object.entries(paths)) app.setPath(name, directory);
  return paths;
}
module.exports = { resolveStoragePaths, prepareStoragePaths, configureStoragePaths };
