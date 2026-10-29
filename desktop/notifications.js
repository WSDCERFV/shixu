(function(global){
 'use strict';
 function create(root){
  const doc=root.ownerDocument,box=doc.createElement('aside'),head=doc.createElement('div'),title=doc.createElement('strong'),grip=doc.createElement('button'),close=doc.createElement('button'),list=doc.createElement('div'),entries=new Map();let position=null,drag=null,paused=false;
  box.id='fw-notifications';box.className='app-notifications';box.hidden=true;box.setAttribute('aria-label','操作提示');head.className='notice-head';title.textContent='操作提示';grip.type='button';grip.textContent='⠿';grip.setAttribute('aria-label','拖动提示窗口，方向键可移动');grip.className='notice-grip';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭全部提示');list.className='notice-list';head.append(title,grip,close);box.append(head,list);root.append(box);
  function place(){if(box.hidden)return;const maxX=Math.max(8,root.clientWidth-box.offsetWidth-8),maxY=Math.max(8,root.clientHeight-box.offsetHeight-8);if(!position){const header=root.querySelector('.topbar,.detail-head'),rect=root.getBoundingClientRect(),scale=rect.width/root.clientWidth;position={x:Math.max(8,(root.clientWidth-box.offsetWidth)/2),y:Math.min(header?(header.getBoundingClientRect().bottom-rect.top)/scale+10:68,maxY)};}position.x=Math.min(maxX,Math.max(8,position.x));position.y=Math.min(maxY,Math.max(8,position.y));box.style.left=position.x+'px';box.style.top=position.y+'px';}
  function remove(key){const e=entries.get(key);if(!e)return;clearTimeout(e.timer);e.node.remove();entries.delete(key);box.hidden=!entries.size;place();}
  function arm(e){clearTimeout(e.timer);if(!e.error&&!paused&&!drag)e.timer=setTimeout(()=>remove(e.key),7000);}
  function show(text,error=false){
   text=String(text||'').trim();if(!text)return;const key=(error?'error:':'info:')+text;let e=entries.get(key);
   if(!e){const node=doc.createElement('section'),icon=doc.createElement('span'),copy=doc.createElement('div'),heading=doc.createElement('strong'),body=doc.createElement('p'),dismiss=doc.createElement('button');node.className='app-notice'+(error?' notice-error':'');node.setAttribute('role',error?'alert':'status');icon.className='notice-icon';icon.setAttribute('aria-hidden','true');icon.textContent=error?'!':'✓';heading.textContent=error?'操作未完成':'操作反馈';body.textContent=text;dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','关闭这条提示');dismiss.onclick=()=>remove(key);copy.append(heading,body);node.append(icon,copy,dismiss);e={key,node,error,timer:0};entries.set(key,e);list.append(node);}
   box.hidden=false;arm(e);requestAnimationFrame(place);return e.node;
  }
  close.onclick=()=>{for(const key of [...entries.keys()])remove(key);};
  box.addEventListener('mouseenter',()=>{paused=true;for(const e of entries.values())clearTimeout(e.timer);});box.addEventListener('mouseleave',()=>{paused=false;for(const e of entries.values())arm(e);});
  box.addEventListener('focusin',()=>{paused=true;for(const e of entries.values())clearTimeout(e.timer);});box.addEventListener('focusout',e=>{if(box.contains(e.relatedTarget))return;paused=false;for(const item of entries.values())arm(item);});
  head.addEventListener('pointerdown',ev=>{if(ev.button!==0||(ev.target.closest('button')&&ev.target!==grip))return;place();drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,left:position.x,top:position.y,scale:root.getBoundingClientRect().width/root.clientWidth};head.setPointerCapture(ev.pointerId);for(const e of entries.values())clearTimeout(e.timer);ev.preventDefault();});
  head.addEventListener('pointermove',ev=>{if(!drag||ev.pointerId!==drag.id)return;position={x:drag.left+(ev.clientX-drag.x)/drag.scale,y:drag.top+(ev.clientY-drag.y)/drag.scale};place();});
  for(const name of ['pointerup','pointercancel'])head.addEventListener(name,()=>{drag=null;for(const e of entries.values())arm(e);});
  grip.addEventListener('keydown',ev=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;ev.preventDefault();place();position[ev.key==='ArrowLeft'||ev.key==='ArrowRight'?'x':'y']+=ev.key==='ArrowLeft'||ev.key==='ArrowUp'?-12:12;place();});
  new ResizeObserver(place).observe(root);return {show,close:()=>close.click()};
 }
 global.ShixuNotices={create};
})(typeof window==='undefined'?globalThis:window);
