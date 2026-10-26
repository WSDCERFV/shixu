const STARTUP_NAME = 'local.shixu.desktop';
function createStartupControl(app, { executable = process.execPath, isolated = !!process.env.SHIXU_DATA_DIR } = {}) {
  const options = { path: executable, args: ['--startup'] };
  function status() {
    if (!app.isPackaged || isolated) return { available: false, enabled: false, note: '开发或隔离测试环境不修改 Windows 开机启动项。' };
    const result = app.getLoginItemSettings(options);
    const entry = result.launchItems?.find(item => item.name === STARTUP_NAME && item.scope === 'user');
    return { available: true, enabled: !!result.openAtLogin && (entry ? entry.enabled : !!result.executableWillLaunchAtLogin), note: result.openAtLogin && entry?.enabled === false ? '启动项已被 Windows 禁用，可重新勾选以启用。' : '' };
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('开机启动设置无效。');
    if (!status().available) throw new Error('请在安装后的应用中设置开机启动。');
    app.setLoginItemSettings({ ...options, name: STARTUP_NAME, openAtLogin: enabled, enabled });
    const result = status();
    if (result.enabled !== enabled) throw new Error('Windows 未应用开机启动设置，请检查系统启动应用权限。');
    return result;
  }
  return { status, set };
}
module.exports = { createStartupControl, STARTUP_NAME };
