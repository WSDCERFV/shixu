const { contextBridge, ipcRenderer } = require('electron');
const boot = ipcRenderer.sendSync('boot');
async function invoke(channel, ...args) { const r = await ipcRenderer.invoke(channel, ...args); if (!r.ok) throw new Error(r.error); return r.value; }
contextBridge.exposeInMainWorld('focusDesktop', {
  initialState: boot?.state || null, initialMail: boot?.mail || null,
  recoveredFiles:boot?.recovered||[],onCloseRequested:callback=>ipcRenderer.on('request-close',callback),
  reportBootFailure:()=>invoke('boot-failed'),
  startupStatus:()=>invoke('startup-status'), setStartup:enabled=>invoke('startup-set',enabled),
  saveState: value => invoke('save-state', value), windowAction: action => invoke('window-action', action),
  saveKey: (id, value) => invoke('save-key', id, value), hasKey: id => invoke('has-key', id), copyKey: (from, to) => invoke('copy-key', from, to),
  chat: input => invoke('chat', input), transcribe: (bytes, mime) => invoke('transcribe', bytes, mime),
  saveMail: (config, auth) => invoke('mail-save', config, auth), mailStatus: () => invoke('mail-status'), testMail: () => invoke('mail-test'),
  showReminder: value => invoke('native-reminder', value),
  startSeuImport: input => invoke('seu-start',input),
  onSeuResult: callback => ipcRenderer.on('seu-result',(_event,value)=>callback(value)),
  openDetailWindow:(value,position)=>invoke('detail-open',value,position),updateDetailWindow:value=>invoke('detail-update',value),closeDetailWindow:()=>invoke('detail-destroy'),
  onDetailAction:callback=>ipcRenderer.on('detail-action',(_event,value)=>callback(value)),
  onWindowState: callback => ipcRenderer.on('window-state', (_e, value) => callback(value)),
  onMailStatus: callback => ipcRenderer.on('mail-status', (_e, value) => callback(value)),
  onOpenTask: callback => ipcRenderer.on('open-task', (_e, value) => callback(value))
});
