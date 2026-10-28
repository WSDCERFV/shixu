const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(__dirname, process.env.SHIXU_PACKAGE_DIR || '../outputs/时序桌面版');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(__dirname, 'node_modules/electron/dist'), out, { recursive: true });
fs.copyFileSync(path.join(out, 'electron.exe'), path.join(out, '时序.exe'));
fs.unlinkSync(path.join(out, 'electron.exe'));
const app = path.join(out, 'resources/app');
fs.mkdirSync(app, { recursive: true });
for (const file of require('./release-files.cjs')) { fs.mkdirSync(path.dirname(path.join(app,file)),{recursive:true}); fs.copyFileSync(path.join(__dirname, file), path.join(app, file)); }
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'shixu-desktop', version: require('./package.json').version, main: 'main.cjs' }));
require('./runtime-dependencies.cjs').copyRuntimePackages(app);
fs.copyFileSync(path.join(__dirname, '使用说明.md'), path.join(out, '使用说明.md'));
fs.copyFileSync(path.join(__dirname,'../THIRD_PARTY_NOTICES.md'),path.join(out,'THIRD_PARTY_NOTICES.md'));
fs.cpSync(path.join(__dirname,'../docs/licenses'),path.join(out,'licenses'),{recursive:true});
if(fs.existsSync(path.join(__dirname,'../LICENSE')))fs.copyFileSync(path.join(__dirname,'../LICENSE'),path.join(out,'LICENSE.txt'));
console.log('桌面版：' + path.join(out, '时序.exe'));
