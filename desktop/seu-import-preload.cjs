const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('seuImport',{
 capture:input=>ipcRenderer.invoke('seu-capture',input),refresh:()=>ipcRenderer.invoke('seu-refresh'),cancel:()=>ipcRenderer.send('seu-close'),
 onTerms:callback=>ipcRenderer.on('seu-terms',(_event,value)=>callback(value)),
 onStatus:callback=>ipcRenderer.on('seu-status',(_event,value)=>callback(value))
});
