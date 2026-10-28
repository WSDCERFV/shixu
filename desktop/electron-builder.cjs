const files = require('./release-files.cjs');
const runtime = require('./runtime-dependencies.cjs').runtimePackages();
module.exports = {
  appId: 'local.shixu.desktop',
  productName: '时序',
  executableName: '时序',
  directories: { output: '../outputs/时序安装包-'+require('./package.json').version, buildResources: 'build' },
  asar: true,
  electronDist: 'node_modules/electron/dist',
  npmRebuild: false,
  files: [...files, 'package.json', ...runtime.map(p=>p.relative+'/**'), '!node_modules/lucide/**'],
  publish: [{ provider: 'github', owner: 'WSDCERFV', repo: 'shixu', releaseType: 'release' }],
  extraFiles: [
    { from: '使用说明.md', to: '使用说明.md' },
    { from: '../THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
    { from: '../docs/licenses', to: 'licenses' },
    ...(require('node:fs').existsSync(require('node:path').join(__dirname,'../LICENSE'))?[{from:'../LICENSE',to:'LICENSE.txt'}]:[])
  ],
  afterPack: require('./release-audit.cjs').afterPack,
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: {
    include: 'build/installer.nsh',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '时序',
    uninstallDisplayName: '时序',
    installerLanguages: ['zh_CN', 'en_US'],
    language: '2052',
    runAfterFinish: false,
    artifactName: 'Shixu-${version}-setup-${arch}.${ext}'
  }
};
