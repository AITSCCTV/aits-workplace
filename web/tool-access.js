import {navigationItems, additionalNavigation, projectSections, canNavigate} from './navigation-catalog.mjs';

// The API remains the authority for all record and action permissions.
document.addEventListener('DOMContentLoaded', () => {
  const {base} = window.AITS_CONFIG, account = window.AITS_SESSION;
  const path = location.pathname.slice(base.length).replace(/index\.html$/, '');
  const route = [...navigationItems, ...additionalNavigation, ...projectSections].find(item => item.path === path);
  if (!route || path === 'navigation/') return;
  const gate = document.createElement('section');
  gate.className = 'aits-access-gate';
  gate.dataset.noTranslate = '';
  gate.setAttribute('aria-live', 'polite');
  const t = (th,en) => window.AITS_I18N.language() === 'en' ? en : th;
  let ready = false;
  function render() {
    const identity = account.info();
    const allowed = ready && identity && !identity.mustChangePassword && canNavigate(route, account);
    document.body.classList.toggle('aits-tool-locked', !allowed);
    gate.hidden = !!allowed;
    if (allowed) return;
    gate.replaceChildren();
    const mark = document.createElement('img');mark.src=base+'brand/aits-icon.svg';mark.alt='AITS';mark.width=56;mark.height=56;
    const title = document.createElement('h1');
    title.textContent = !ready ? t('กำลังตรวจสอบสิทธิ์…','Checking access…') : !identity ? t('เข้าสู่ระบบ AITS','Sign in to AITS') : identity.mustChangePassword ? t('เปลี่ยนรหัสผ่านเพื่อดำเนินการต่อ','Change your password to continue') : t('ไม่มีสิทธิ์เข้าถึงเครื่องมือนี้','You don’t have access to this tool');
    const note = document.createElement('p');note.textContent = !ready ? '' : !identity ? t('ใช้บัญชีพนักงานเพื่อเปิดเครื่องมือนี้','Use your employee account to open this tool.') : identity.mustChangePassword ? '' : t('ติดต่อผู้ดูแลเพื่อขอสิทธิ์เข้าถึงตามบทบาทของคุณ','Contact your administrator to request access for your role.');
    gate.append(mark,title,note);
    if (ready && !identity) {const signIn=document.createElement('button');signIn.type='button';signIn.textContent=t('เข้าสู่ระบบ','Sign in');signIn.onclick=()=>window.AITS_OPEN_LOGIN?.();gate.append(signIn);}
    const back=document.createElement('a');back.href=base+'master-navigation/';back.textContent='Master Navigation';gate.append(back);
  }
  document.body.append(gate);render();
  account.ready.then(()=>{ready=true;render()});
  window.addEventListener('aits-auth-expired',render);
  window.addEventListener('aits-session-ready',render);
  window.addEventListener('aits-language-change',render);
});
