const statusBox=document.getElementById('status'),capture=document.getElementById('capture'),termField=document.getElementById('term'),firstMonday=document.getElementById('first-monday'),confirmed=document.getElementById('term-confirmed'),summerConfirmed=document.getElementById('summer-confirmed');
let terms=[],busy=false;
function showStatus(text,error=false){statusBox.replaceChildren();const strong=document.createElement('strong');strong.textContent=text;statusBox.append(strong);statusBox.classList.toggle('error',error);}
function sync(){const term=terms.find(t=>t.code===termField.value);capture.disabled=busy||!term||!confirmed.checked||!firstMonday.value||(term.summer&&!summerConfirmed.checked);}
window.seuImport.onStatus(({text,error})=>showStatus(text,!!error));
window.seuImport.onTerms(value=>{
 terms=value.terms||[];termField.replaceChildren(new Option('请选择要导入的学期（必选）',''));
 for(const t of terms)termField.append(new Option(t.name+' · '+t.code,t.code));
 termField.disabled=false;confirmed.disabled=false;firstMonday.disabled=false;termField.value='';confirmed.checked=false;summerConfirmed.checked=false;firstMonday.value='';sync();
});
termField.onchange=()=>{const t=terms.find(t=>t.code===termField.value);confirmed.checked=false;summerConfirmed.checked=false;firstMonday.value=t?.firstMonday||'';document.getElementById('summer-note').hidden=!t?.summer;document.getElementById('term-note').textContent=t?(t.summer?'注意：你选择的是暑期或短学期，需要额外确认。':t.firstMonday?'已按该学期名称填入内置校历，请再次核对日期。':'此学期无可靠的内置校历，请对照学校校历填写第一教学周周一。')+' 所选：'+t.name+'（'+t.code+'）':'请从学校返回的列表明确选择学期。';sync();};
for(const el of [confirmed,summerConfirmed])el.onchange=sync;
firstMonday.onchange=()=>{confirmed.checked=false;sync();};
capture.onclick=async()=>{if(capture.disabled)return;busy=true;sync();termField.disabled=firstMonday.disabled=confirmed.disabled=summerConfirmed.disabled=true;
 try{const r=await window.seuImport.capture({termCode:termField.value,firstMonday:firstMonday.value,confirmed:confirmed.checked,summerConfirmed:summerConfirmed.checked});if(!r.ok)showStatus(r.error,true);}catch{showStatus('读取失败，请检查学校窗口状态后重试。',true);}finally{busy=false;termField.disabled=firstMonday.disabled=confirmed.disabled=summerConfirmed.disabled=false;sync();}
};
document.getElementById('refresh').onclick=async()=>{if(busy)return;const button=document.getElementById('refresh');button.disabled=true;try{await window.seuImport.refresh();}finally{button.disabled=false;}};
document.getElementById('close').onclick=()=>window.seuImport.cancel();
