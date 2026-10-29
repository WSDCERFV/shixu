(function(global){
 const modules={today:{title:'今 / 他日计划',icon:'list-checks',feature:'today',w:3,h:12,minW:2,minH:6},week:{title:'周计划',icon:'calendar-days',feature:'calendar',w:6,h:12,minW:4,minH:7},ai:{title:'AI 对话与规划',icon:'messages-square',feature:'ai',w:3,h:12,minW:3,minH:7},stats:{title:'任务统计',icon:'chart-column',feature:'stats',w:9,h:5,minW:4,minH:4},focus:{title:'番茄时钟',icon:'timer',feature:'focus',w:3,h:8,minW:2,minH:6},quote:{title:'每日激励',icon:'sparkle',w:3,h:4,minW:2,minH:3},plans:{title:'长期与每日计划',icon:'target',feature:'plans',w:6,h:6,minW:3,minH:4},allplans:{title:'多周计划入口',icon:'calendar-range',feature:'allplans',w:3,h:4,minW:2,minH:3},school:{title:'课表与校历检查',icon:'graduation-cap',feature:'school',w:3,h:4,minW:2,minH:3}};
 const features={today:'当日计划',calendar:'周计划',allplans:'所有计划总览',plans:'长期与每日计划',ai:'AI 助手',stats:'统计',focus:'专注',school:'课表导入',api:'API 管理'};
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
 function normalize(items){
  if(!Array.isArray(items))return null;const seen=new Set(),out=[];
  for(const item of items){const spec=modules[item?.id];if(!spec||seen.has(item.id))continue;seen.add(item.id);const num=(k,v)=>Number.isFinite(Number(item[k]))?Math.round(Number(item[k])):v,w=clamp(num('w',spec.w),spec.minW,12),h=clamp(num('h',spec.h),spec.minH,24);let next={id:item.id,x:clamp(num('x',0),0,12-w),y:clamp(num('y',0),0,240),w,h};while(out.some(o=>overlap(o,next)))next.y=Math.max(...out.filter(o=>overlap(o,next)).map(o=>o.y+o.h));out.push(next);}
  return out;
 }
 function defaults(mode){return normalize(mode==='minimal'?[{id:'today',x:0,y:0,w:3,h:12},{id:'week',x:3,y:0,w:6,h:12},{id:'ai',x:9,y:0,w:3,h:12}]:[{id:'today',x:0,y:0,w:3,h:12},{id:'week',x:3,y:0,w:6,h:12},{id:'ai',x:9,y:0,w:3,h:12},{id:'stats',x:0,y:12,w:9,h:5},{id:'focus',x:9,y:12,w:3,h:8},{id:'quote',x:0,y:17,w:9,h:3}]);}
 function place(items,id,change={}){
  const clean=normalize(items)||[],spec=modules[id];if(!spec)return clean;const old=clean.find(i=>i.id===id),others=clean.filter(i=>i.id!==id),candidate={id,x:0,y:0,w:spec.w,h:spec.h,...old,...change};
  if(!old&&!Object.keys(change).length){let found=false;for(let y=0;y<264&&!found;y++)for(let x=0;x<=12-candidate.w;x++){candidate.x=x;candidate.y=y;if(!others.some(o=>overlap(o,candidate))){found=true;break;}}}
  // The selected module takes the requested position; other modules move down, never overlap it.
  const normalized=normalize([candidate,...others]);return clean.some(i=>i.id===id)?clean.map(i=>normalized.find(n=>n.id===i.id)):normalized;
 }
 const enabled=(preferences,key)=>!key||preferences?.features?.[key]!==false;
 function visible(items,preferences){return (normalize(items)||[]).filter(i=>enabled(preferences,modules[i.id].feature));}
 const api={modules,features,normalize,defaults,place,overlap,enabled,visible};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.ShixuWorkspace=api;
})(typeof window==='undefined'?globalThis:window);
