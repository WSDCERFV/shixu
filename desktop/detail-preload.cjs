const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('detailBridge',{
 action:value=>ipcRenderer.invoke('detail-action',value),
 onData:callback=>ipcRenderer.on('detail-data',(_e,value)=>callback(value)),
 onClose:callback=>ipcRenderer.on('detail-request-close',callback)
});
