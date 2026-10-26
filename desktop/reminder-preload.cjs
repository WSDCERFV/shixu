const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reminderBridge', { close: () => ipcRenderer.send('reminder-close'), open: id => ipcRenderer.send('reminder-open', id), onData: callback => ipcRenderer.on('reminder-data', (_e, value) => callback(value)) });
