const test=require('node:test'),assert=require('node:assert/strict');
const {createStartupControl,STARTUP_NAME}=require('../startup.cjs');
test('startup is opt-in and uses the installed executable, stable user entry, and matching arguments',()=>{
 let state={openAtLogin:false,executableWillLaunchAtLogin:false,launchItems:[]};const calls=[];
 const app={isPackaged:true,getLoginItemSettings:options=>{assert.deepEqual(options,{path:'D:\\应用 路径\\时序.exe',args:['--startup']});return state;},setLoginItemSettings:value=>{calls.push(value);state={openAtLogin:value.openAtLogin,executableWillLaunchAtLogin:value.enabled,launchItems:[{name:STARTUP_NAME,scope:'user',enabled:value.enabled}]};}};
 const control=createStartupControl(app,{executable:'D:\\应用 路径\\时序.exe',isolated:false});assert.equal(control.status().enabled,false);assert.equal(calls.length,0);
 assert.equal(control.set(true).enabled,true);assert.deepEqual(calls[0],{path:'D:\\应用 路径\\时序.exe',args:['--startup'],name:STARTUP_NAME,openAtLogin:true,enabled:true});assert.equal(control.set(false).enabled,false);assert.throws(()=>control.set('true'),/无效/);
});
test('system-disabled items are not misreported as active, and silent write failures are surfaced',()=>{
 const state={openAtLogin:true,executableWillLaunchAtLogin:false,launchItems:[{name:STARTUP_NAME,scope:'user',enabled:false}]};const control=createStartupControl({isPackaged:true,getLoginItemSettings:()=>state,setLoginItemSettings:()=>{}},{isolated:false});assert.equal(control.status().enabled,false);assert.match(control.status().note,/Windows/);assert.throws(()=>control.set(true),/未应用/);
});
test('development and isolated QA never modify the real startup entry',()=>{
 for(const [isPackaged,isolated] of [[false,false],[true,true]]){const app={isPackaged,getLoginItemSettings:()=>{throw Error('must not access system startup');},setLoginItemSettings:()=>{throw Error('must not modify system startup');}},control=createStartupControl(app,{isolated});assert.equal(control.status().available,false);assert.throws(()=>control.set(true),/安装后/);}
});
