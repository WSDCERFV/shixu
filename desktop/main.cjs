const { app, BrowserWindow, ipcMain, session, safeStorage, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const services = require('./services.cjs');
const {createSeuImporter}=require('./seu-importer.cjs');
const {createDetailWindow}=require('./detail-window.cjs');
const {createLocalStore,validateWorkspace}=require('./local-store.cjs');
const {configureStoragePaths}=require('./storage-paths.cjs');
const startup=require('./startup.cjs').createStartupControl(app);
try { configureStoragePaths(app); }
catch(error) { require('electron').dialog.showErrorBox('无法使用本地存储目录', error.message + '\n应用已停止启动，不会改用其他目录或覆盖原记录。'); app.exit(1); }
app.setName('时序');
app.setAppUserModelId('local.shixu.desktop');
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
let win, reminder, timerPopup, seuImporter, detailWindow, state = null, vault = {}, mailbox = { enabled: false, host: 'smtp.qq.com', port: 465, from: '', to: '' }, mailLog = [], mailBusy = false, writeQueue = Promise.resolve(),secretQueue=Promise.resolve(),allowClose=false;
const store=createLocalStore(app.getPath('userData'));
const rendererURL = pathToFileURL(path.join(__dirname, 'renderer.html')).href;
const read=(name,fallback)=>store.read(name,fallback);
function write(name, data) {
  const operation = store.write(name,data);
  writeQueue = operation.catch(() => {}); return operation;
}
async function secret(id) {
  if (!vault[id]) return '';
  try { return (await safeStorage.decryptStringAsync(Buffer.from(vault[id], 'base64'))).result; }
  catch { throw new Error('本机无法解密已保存的授权信息，请重新填写。'); }
}
function putSecret(id, value) {
 const operation=secretQueue.then(async()=>{
  if (typeof value !== 'string' || value.length > 10000) throw new Error('授权信息格式不正确。');
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系统加密暂不可用，未保存授权信息。');
  const encrypted = value ? (await safeStorage.encryptStringAsync(value)).toString('base64') : null;
  const next = { ...vault }; if (encrypted) next[id] = encrypted; else delete next[id];
  await write('secrets.json', next); vault = next;
 });secretQueue=operation.catch(()=>{});return operation;
}
function trusted(event) { return event.sender === win?.webContents && event.senderFrame?.url === rendererURL; }
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) return { ok: false, error: '请求来源不受支持。' };
    try { return { ok: true, value: await callback(...args) }; }
    catch (e) { return { ok: false, error: e.message || '操作失败，请重试。' }; }
  });
}
function provider(id, role) {
  const s = state?.privateContent;
  if (!s?.providerSwitchEnabled) throw new Error('请先启用供应商配置。');
  const p = s.providers?.find(x => x.id === id);
  if (!p || !p.enabled || (p.role !== role && p.role !== 'both')) throw new Error('请在 API 管理中选择相应用途的服务。');
  return p;
}
function unpackEvents() {
  return (state?.privateContent?.e || []).map(a => ({ id: a[0], date: a[1], title: a[2], start: a[3], end: a[4], state: a[6], content: a[8], emailEnabled: a[18], emailTo: a[19], emailLead: a[20] }));
}
function mailStatus() { return { config: mailbox, hasAuth: !!vault.smtp, log: mailLog.slice(-12).map(x => ({ ...x, key: undefined })) }; }
function notifyMail() { win?.webContents.send('mail-status', mailStatus()); }
async function deliver(event) {
  const live = unpackEvents().find(e => e.id === event.id);
  const due = live && services.dueMails([live], mailbox, mailLog)[0];
  if (!due) return;
  event = due;
  const sender = { ...mailbox };
  const item = { key: event.mailKey, title: event.title, status: 'sending', at: new Date().toISOString() };
  mailLog.push(item); mailLog = mailLog.slice(-500); await write('mail-log.json', mailLog); notifyMail();
  try { await services.sendMail(sender, await secret('smtp'), event); item.status = 'sent'; item.note = '发件服务器已接受'; }
  catch { item.status = 'failed'; item.note = '发送失败，请检查网络、授权码和收件地址；不会自动重复发送。'; }
  await write('mail-log.json', mailLog); notifyMail();
}
async function checkMail() {
  if (mailBusy || !mailbox.enabled || !vault.smtp) return;
  mailBusy = true;
  try { for (const e of services.dueMails(unpackEvents(), mailbox, mailLog)) await deliver(e); }
  finally { mailBusy = false; }
}
function showReminder(payload) {
  if (!payload||!Array.isArray(payload.items) || payload.items.length > 2000||JSON.stringify(payload).length>5_000_000) throw new Error('提醒内容无效或过大。');
  const timer = payload.kind === 'timer';
  let popup = timer ? timerPopup : reminder;
  if (!popup || popup.isDestroyed()) {
    const area = screen.getPrimaryDisplay().workArea;
    popup = new BrowserWindow({ width: 338, height: 280, x: Math.max(area.x, area.x + area.width - 358), y: Math.max(area.y, area.y + area.height - (timer ? 600 : 300)), frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#202128', webPreferences: { preload: path.join(__dirname, 'reminder-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    if (timer) timerPopup = popup; else reminder = popup;
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', e => e.preventDefault());
    popup.pendingPayload=payload;
    popup.webContents.once('did-finish-load', () => {if(!popup.isDestroyed()){popup.webContents.send('reminder-data', popup.pendingPayload);popup.showInactive();}});
    popup.loadFile(path.join(__dirname,'reminder.html')).catch(()=>{});
  } else {popup.pendingPayload=payload;if(!popup.webContents.isLoadingMainFrame()){popup.webContents.send('reminder-data', payload);popup.showInactive();}}
}
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
if(primary)app.whenReady().then(async () => {
  try {
    state = await read('workspace.json', null); vault = await read('secrets.json', {}); mailbox = await read('mailbox.json', mailbox); mailLog = await read('mail-log.json', []);
  } catch { require('electron').dialog.showErrorBox('本地记录读取失败', '记录文件无法读取。为避免覆盖原记录，应用已停止启动。请保留用户数据目录并检查文件。'); app.quit(); return; }
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === win?.webContents && permission === 'media' && !details.mediaTypes?.includes('video')));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === win?.webContents && permission === 'media');
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('blob:') && !details.url.startsWith('data:') && !details.url.startsWith('devtools:') }));
  ipcMain.on('boot', event => { event.returnValue = trusted(event) ? { state, mail: mailStatus(), recovered:store.recovered } : null; });
  handle('save-state', async value => {
    validateWorkspace(value);if(JSON.stringify(value).length > 5_000_000) throw new Error('本地记录内容过大。');
    await write('workspace.json', value); state = value; return true;
  });
  handle('startup-status', () => startup.status());
  handle('startup-set', enabled => startup.set(enabled));
  handle('boot-failed',()=>{require('electron').dialog.showErrorBox('无法恢复本地工作区','本地记录无法完整恢复，已停止启动以保护原文件。请保留用户数据目录及其中的备份。');allowClose=true;win.close();return true;});
  handle('window-action', async action => { if (action === 'minimize') win.minimize(); else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (action === 'close') { await secretQueue;await writeQueue;allowClose=true;win.close(); } return win?.isMaximized(); });
  handle('save-key', async (id, value) => { if (!/^[\w-]{1,100}$/.test(id)) throw new Error('供应商编号无效。'); await putSecret('api:' + id, value); return true; });
  handle('has-key', id => !!vault['api:' + id]);
  handle('copy-key', async (from, to) => { const key = await secret('api:' + from); if (key) await putSecret('api:' + to, key); return true; });
  handle('chat', async input => { if (JSON.stringify(input).length > 250000 || !Array.isArray(input.messages)) throw new Error('对话太长，请开始新对话。'); const p = provider(state?.privateContent?.activePlan, 'plan'); return services.chat(p, await secret('api:' + p.id), input); });
  handle('transcribe', async (bytes, mime) => { const p = provider(state?.privateContent?.activeVoice, 'voice'); return services.transcribe(p, await secret('api:' + p.id), new Uint8Array(bytes), mime); });
  handle('mail-save', async (config, auth) => { const next = services.validateMailbox(config); if (auth) await putSecret('smtp', auth); if (next.enabled && !vault.smtp) throw new Error('开启邮件提醒前请填写授权码。'); await write('mailbox.json', next); mailbox = next; return mailStatus(); });
  handle('mail-status', () => mailStatus());
  handle('mail-test', async () => { if (!mailbox.from || !mailbox.to) throw new Error('请先保存发件邮箱和收件邮箱。'); try { await services.sendMail(mailbox, await secret('smtp'), null, true); } catch { throw new Error('测试邮件发送失败，请检查网络、授权码和邮箱 SMTP 设置。'); } return '测试邮件已被发件服务器接受，请检查收件箱或垃圾箱。'; });
  handle('native-reminder', payload => { showReminder(payload); return true; });
  seuImporter=createSeuImporter(()=>win,result=>win?.webContents.send('seu-result',result));
  handle('seu-start',input=>seuImporter.open(input));
  detailWindow=createDetailWindow(()=>win,action=>win?.webContents.send('detail-action',action));
  handle('detail-open',(value,position)=>detailWindow.open(value,position));
  handle('detail-update',value=>detailWindow.update(value));
  handle('detail-destroy',()=>{detailWindow.destroy();return true;});
  ipcMain.on('reminder-close', e => { if ([reminder?.webContents, timerPopup?.webContents].includes(e.sender)) BrowserWindow.fromWebContents(e.sender)?.hide(); });
  ipcMain.on('reminder-open', (e, id) => { if (![reminder?.webContents, timerPopup?.webContents].includes(e.sender)) return; win.restore(); win.show(); win.focus(); win.webContents.send('open-task', String(id)); });
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: Math.min(1440, area.width), height: Math.min(920, area.height), minWidth: Math.min(800, area.width), minHeight: Math.min(600, area.height), frame: false, backgroundColor: '#081b2a', title: '时序 · 桌面版', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close',e=>{if(!allowClose){e.preventDefault();win.webContents.send('request-close');}});
  for (const event of ['maximize', 'unmaximize']) win.on(event, () => win.webContents.send('window-state', win.isMaximized()));
  win.on('closed', () => { win = null; reminder?.destroy(); timerPopup?.destroy(); seuImporter?.cancel(); detailWindow?.destroy(); });
  await win.loadFile(path.join(__dirname,'renderer.html'));
  setInterval(() => checkMail().catch(() => {}), 5000);
});
app.on('window-all-closed', () => app.quit());
