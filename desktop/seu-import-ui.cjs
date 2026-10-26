const statusBox=document.getElementById('status'),capture=document.getElementById('capture');
window.seuImport.onStatus(({text,error})=>{statusBox.replaceChildren();const strong=document.createElement('strong'),note=document.createElement('p');strong.textContent=text;note.textContent='账户与密码只用于本次学校登录；课表读取后返回应用预览，确认后保存在本地。';statusBox.append(strong,note);statusBox.classList.toggle('error',!!error);});
capture.onclick=async()=>{capture.disabled=true;try{const r=await window.seuImport.capture();if(!r.ok){const text=document.createElement('strong');text.textContent=r.error;statusBox.replaceChildren(text);statusBox.classList.add('error');}}finally{capture.disabled=false;}};
document.getElementById('close').onclick=()=>window.seuImport.cancel();
