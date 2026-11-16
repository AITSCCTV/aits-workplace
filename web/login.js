(()=>{
 const t=(th,en)=>window.AITS_I18N.language()==='en'?en:th,account=window.AITS_SESSION;
 document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.createElement('dialog');dialog.className='aits-login';dialog.dataset.noTranslate='';document.body.append(dialog);
  let changing=false,required=false;
  const field=(label,type,name,auto)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.name=name;input.required=true;input.autocomplete=auto;input.maxLength=type==='password'?128:254;wrap.append(input);return wrap;};
  async function show(change=false){
   changing=change;required=!!account.info()?.mustChangePassword;const options=await account.options;
   dialog.replaceChildren();const title=document.createElement('h2');title.textContent=change?t('เปลี่ยนรหัสผ่าน','Change password'):t('เข้าสู่ระบบ AITS','Sign in to AITS');dialog.append(title);
   const note=document.createElement('p');note.textContent=change?t('ใช้รหัสผ่านใหม่อย่างน้อย 15 ตัวอักษร หลังบันทึกให้เข้าสู่ระบบอีกครั้ง','Use a new password of at least 15 characters. Sign in again after saving.'):t('ใช้บัญชี Google หรือบัญชีพื้นที่ทำงานที่ผู้ดูแลสร้างให้','Use your Google account or a workspace account created by an administrator.');dialog.append(note);
   const error=document.createElement('p');error.className='aits-login-error';error.setAttribute('role','alert');dialog.append(error);
   if(!change){const google=document.createElement('button');google.type='button';google.className='aits-login-google';google.textContent=options.google?t('เข้าสู่ระบบด้วย Google / รหัสทางอีเมล','Continue with Google / email code'):t('เข้าสู่ระบบด้วยรหัสทางอีเมล','Continue with email code');google.onclick=()=>account.googleLogin();dialog.append(google);if(!options.google){const pending=document.createElement('small');pending.textContent=t('Google sign-in กำลังรอเชื่อมต่อ','Google sign-in is pending connection.');dialog.append(pending);}}
   if(change||options.password){const form=document.createElement('form');form.append(change?field(t('รหัสผ่านปัจจุบัน / รหัสชั่วคราว','Current / temporary password'),'password','currentPassword','current-password'):field(t('อีเมลหรือบัญชีพื้นที่ทำงาน','Email or workspace account'),'email','email','username'));form.append(field(change?t('รหัสผ่านใหม่','New password'):t('รหัสผ่านพื้นที่ทำงาน','Workspace password'),'password','password',change?'new-password':'current-password'));if(change)form.append(field(t('ยืนยันรหัสผ่านใหม่','Confirm new password'),'password','confirm','new-password'));
    const submit=document.createElement('button');submit.className='aits-login-submit';submit.type='submit';submit.textContent=change?t('บันทึกรหัสผ่าน','Save password'):t('เข้าสู่ระบบด้วยรหัสผ่าน','Sign in with password');form.append(submit);
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent='';const data=Object.fromEntries(new FormData(form));try{if(change){if(data.password!==data.confirm)throw Error(t('รหัสผ่านไม่ตรงกัน','Passwords do not match.'));await account.auth('/auth/password/change',data);account.clear();}else account.accept(await account.auth('/auth/password/login',data));}catch(e){error.textContent=e.message;submit.disabled=false;}};dialog.append(form);
   }
   const close=document.createElement('button');close.className='aits-login-close';close.type='button';close.textContent=required?t('ออกจากระบบ','Sign out'):t('ปิด','Close');close.onclick=async()=>{if(required){try{await account.auth('/auth/logout',{})}catch{}account.clear();}else dialog.close();};dialog.append(close);
   if(!dialog.open)dialog.showModal();dialog.querySelector('input')?.focus();
  }
  dialog.addEventListener('cancel',e=>{if(required)e.preventDefault()});
  window.AITS_OPEN_LOGIN=()=>show(false);
  account.ready.then(()=>{if(account.info()?.mustChangePassword)show(true);else if(account.info()?.passwordLogin){const button=document.createElement('button');button.type='button';button.textContent=t('เปลี่ยนรหัสผ่าน','Change password');button.onclick=()=>show(true);document.querySelector('.workspace-account')?.append(button);}});
 });
})();
