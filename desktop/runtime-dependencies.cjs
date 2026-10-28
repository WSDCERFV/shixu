// Keep the no-install build and the installed build on the same production dependencies.
const fs=require('node:fs'),path=require('node:path');
function runtimePackages(root=__dirname){
 const found=new Map(),modules=path.join(root,'node_modules');
 function visit(name,from){
  let directory=path.dirname(require.resolve(name,{paths:[from]})),metadata;
  for(;;){const file=path.join(directory,'package.json');if(fs.existsSync(file)){const p=JSON.parse(fs.readFileSync(file,'utf8'));if(p.name===name){metadata=p;break;}}const parent=path.dirname(directory);if(parent===directory)throw new Error('运行依赖缺失：'+name);directory=parent;}
  const relative=path.relative(root,directory).replaceAll('\\','/');
  if(!directory.startsWith(modules+path.sep)||relative.startsWith('../'))throw new Error('运行依赖不在项目目录中：'+name);
  if(found.has(relative))return;found.set(relative,{name,version:metadata.version,source:directory,relative});
  for(const dependency of Object.keys(metadata.dependencies||{}))visit(dependency,directory);
 }
 const dependencies=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).dependencies||{};
 for(const name of Object.keys(dependencies))if(name!=='lucide')visit(name,root);
 return [...found.values()];
}
function copyRuntimePackages(destination){for(const p of runtimePackages()){const target=path.join(destination,p.relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(p.source,target,{recursive:true});}}
module.exports={runtimePackages,copyRuntimePackages};
