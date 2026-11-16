(() => {
 window.aitsFetch=(path,options={})=>fetch(path==='/api/status'?'/api/connection':path,options);
 document.addEventListener('DOMContentLoaded',()=>{
  const shell=document.querySelector('.shell');
  const gate=document.createElement('section');gate.className='studio-login';gate.dataset.noTranslate='';
  gate.innerHTML='<p class="eyebrow">AITS / FLOORPLAN STUDIO</p><h1></h1><p class="studio-login-help"></p>';
  shell.before(gate);
  function refresh(){const signed=window.AITS_SESSION?.signedIn();shell.hidden=!signed;shell.inert=!signed;gate.hidden=!!signed;document.documentElement.classList.remove('login-required');const en=window.AITS_I18N.language()==='en';gate.querySelector('h1').textContent=en?'Your next design starts here':'เริ่มออกแบบผังของคุณ';gate.querySelector('.studio-login-help').textContent=en?'Sign in to AITS above. Your workspace login opens Floorplan Studio—no separate password.':'เข้าสู่ระบบ AITS ด้านบนเพื่อเปิด Floorplan Studio โดยไม่ต้องใช้รหัสผ่านแยก';}
  refresh();window.addEventListener('aits-auth-expired',refresh);window.addEventListener('aits-language-change',refresh);
 });
})();
