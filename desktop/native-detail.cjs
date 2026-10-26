const root=document.getElementById('focus-workspace'),$=id=>document.getElementById('fw-'+id);let model=null,dirty=false,inputTimer=0,saving=false;
const ids=()=>[...root.querySelectorAll('input[id],select[id],textarea[id]')];
function collect(){return {...Object.fromEntries(ids().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])),__weekdays:[...root.querySelectorAll('[data-routine-weekday]:checked')].map(e=>Number(e.value))};}
function send(type,extra={}){if(!model)return;clearTimeout(inputTimer);return window.detailBridge.action({type,key:model.key,fields:collect(),...extra});}
function paint(value){
 const same=model?.key===value.key;model=value;
 if(value.notice||value.error||!same)saving=false;
 if(!same||!dirty||value.force){
  for(const [id,options] of Object.entries(value.options||{})){const field=document.getElementById(id);if(field){field.replaceChildren();for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.text;field.append(option);}}}
  for(const [id,props] of Object.entries(value.controls||{})){const el=document.getElementById(id);if(!el)continue;el.disabled=!!props.disabled;if('required'in props)el.required=!!props.required;}
  for(const [id,data] of Object.entries(value.fields||{})){const el=document.getElementById(id);if(!el)continue;if(el.type==='checkbox')el.checked=!!data;else el.value=data;}
  for(const [id,text] of Object.entries(value.texts||{})){const el=document.getElementById(id);if(el)el.textContent=text;}
  for(const [id,html] of Object.entries(value.sections||{})){const el=document.getElementById(id);if(el)el.innerHTML=html;}
  if(Array.isArray(value.fields?.__weekdays))root.querySelectorAll('[data-routine-weekday]').forEach(e=>e.checked=value.fields.__weekdays.includes(Number(e.value)));
  for(const [id,hidden] of Object.entries(value.hidden||{})){const el=document.getElementById(id);if(el)el.hidden=!!hidden;}
  dirty=false;
 }
 root.style.colorScheme=value.theme==='auto'?'light dark':value.theme||'dark';root.style.setProperty('--accent-choice',value.accent||'#25b8f2');root.style.setProperty('--accent-light',value.accentLight||'#286f89');$('detail-slot').hidden=false;$('detail-title').textContent=value.title+' · 可拖到桌面任意位置';$('detail-dock').textContent='放回应用';$('detail-detach').hidden=true;
 if(value.texts?.['fw-task-email-default'])$('task-email-default').textContent=value.texts['fw-task-email-default'];
 for(const field of ids())field.disabled=saving||!!value.controls?.[field.id]?.disabled;for(const id of ['task-save','plan-save'])$(id).disabled=saving||!!value.controls?.['fw-'+id]?.disabled;
 const note=$('native-feedback');note.textContent=value.notice||'';note.classList.toggle('error',!!value.error);window.lucide?.createIcons({attrs:{width:16,height:16}});
}
window.detailBridge.onData(paint);window.detailBridge.onClose(()=>send('close'));
root.addEventListener('input',ev=>{if(!model||!ev.target.matches('input,select,textarea'))return;dirty=true;$('native-feedback').textContent='有未保存的修改';send('draft');});
root.addEventListener('change',ev=>{if(ev.target.dataset.milestonePlan){send('milestone',{planId:ev.target.dataset.milestonePlan,milestoneId:ev.target.dataset.milestoneId,checked:ev.target.checked});return;}dirty=true;send('draft');});
root.addEventListener('click',ev=>{const b=ev.target.closest('button');if(b?.dataset.open)send('open-task',{id:b.dataset.open});});
function save(){if(saving)return;const form=$(model?.kind==='plan'?'plan-form':'detail-form');if(!form?.reportValidity())return;saving=true;$('native-feedback').textContent='正在保存…';send('save');for(const field of ids())field.disabled=true;for(const id of ['task-save','plan-save'])$(id).disabled=true;}
$('task-save').onclick=save;$('plan-save').onclick=save;for(const id of ['detail-form','plan-form'])$(id).onsubmit=e=>{e.preventDefault();save();};
$('detail-close').onclick=()=>send('close');$('detail-dock').onclick=()=>send('attach');$('task-delete').onclick=()=>send('delete');$('plan-delete').onclick=()=>send('delete');$('task-ai').onclick=()=>send('ai');$('plan-ai').onclick=()=>send('ai');$('task-duration').onclick=()=>send('duration');
$('task-mail-settings').onclick=()=>send('mail-settings');
$('feeling-mic').onclick=()=>{const el=$('task-feeling');el.focus();el.setSelectionRange(el.value.length,el.value.length);$('feeling-voice-note').textContent='请按 Win+H 口述心得；填写后点击保存。';};
