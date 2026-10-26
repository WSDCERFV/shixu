const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('seuImport',{
 capture:()=>ipcRenderer.invoke('seu-capture'),cancel:()=>ipcRenderer.send('seu-close'),
 onStatus:callback=>ipcRenderer.on('seu-status',(_event,value)=>callback(value))
});
