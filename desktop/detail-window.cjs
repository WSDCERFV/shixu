const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
function createDetailWindow(getMain,onAction){
 let window=null,model=null;
 const url=pathToFileURL(path.join(__dirname,'native-detail.html')).href;
 const trusted=e=>window&&!window.isDestroyed()&&e.sender===window.webContents&&e.senderFrame?.url===url;
 const destroy=()=>{if(window&&!window.isDestroyed())window.destroy();window=null;};
 ipcMain.handle('detail-action',(e,action)=>{
  if(!trusted(e)||!action||JSON.stringify(action).length>200000||action.key!==model?.key)return false;
  if(action.fields)model.fields=action.fields;
  onAction(action);
  if(action.type==='mail-settings'){const main=getMain();if(main&&!main.isDestroyed()){if(main.isMinimized())main.restore();main.show();main.focus();}}
  if(action.type==='close'||action.type==='attach')destroy();return true;
 });
 function update(value){if(!window||window.isDestroyed())return false;model=value;window.webContents.send('detail-data',value);return true;}
 async function open(value,position){
  if(!value||typeof value.key!=='string'||JSON.stringify(value).length>200000)throw new Error('详情内容无效。');
  if(update(value)){window.show();window.focus();return true;}
  model=value;const main=getMain(),bounds=main.getBounds(),point=position&&Number.isFinite(position.x)&&Number.isFinite(position.y)?position:{x:bounds.x+bounds.width-100,y:bounds.y+70},area=screen.getDisplayNearestPoint(point).workArea;
  const width=Math.min(430,area.width),height=Math.min(790,area.height);
  window=new BrowserWindow({width,height,minWidth:Math.min(320,area.width),minHeight:Math.min(400,area.height),x:Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-height))),parent:main,frame:false,resizable:true,backgroundColor:'#0c2235',show:false,title:'时序 · 独立详情',webPreferences:{preload:path.join(__dirname,'detail-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const current=window;current.webContents.setWindowOpenHandler(()=>({action:'deny'}));current.webContents.on('will-navigate',e=>e.preventDefault());
  current.on('close',e=>{e.preventDefault();current.webContents.send('detail-request-close');setTimeout(()=>{if(!current.isDestroyed()){onAction({type:'close',key:model?.key,fields:model?.fields});current.destroy();}},1000);});
  current.on('closed',()=>{if(window===current)window=null;});await current.loadFile(path.join(__dirname,'native-detail.html'));if(current.isDestroyed())return false;current.webContents.send('detail-data',model);current.show();return true;
 }
 return {open,update,destroy};
}
module.exports={createDetailWindow};
