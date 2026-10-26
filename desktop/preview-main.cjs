// Only the no-install preview uses this entry point. Installed app storage is unchanged.
const fs=require('node:fs'),path=require('node:path');
const directory=process.env.SHIXU_DATA_DIR||path.join(path.dirname(process.execPath),'预览数据');
process.env.SHIXU_DATA_DIR=directory;
try{
 fs.mkdirSync(directory,{recursive:true});
 const workspace=path.join(directory,'workspace.json');
 // Set the first-launch mode without adding any tasks, chats, providers or test fixtures.
 if(!fs.existsSync(workspace)&&!fs.existsSync(workspace+'.bak'))fs.writeFileSync(workspace,JSON.stringify({modelContent:{tasks:0},privateContent:{v:3,p:{appMode:'minimal'},e:[]}}),{flag:'wx',mode:0o600});
}catch(error){require('electron').dialog.showErrorBox('预览数据目录不可用','请将整个预览文件夹放在可写的位置再打开。\n'+error.message);require('electron').app.exit(1);}
require('./main.cjs');
