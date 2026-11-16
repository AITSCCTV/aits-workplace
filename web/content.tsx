import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ContentStudio from '../studios/content/ContentStudio';
function Studio(){
 const [signed,setSigned]=useState((window as any).AITS_SESSION.signedIn()),[lang,setLang]=useState((window as any).AITS_I18N.language());
 const t=(th:string,en:string)=>lang==='en'?en:th;
 useEffect(()=>{sessionStorage.removeItem('aits-content-staff');const auth=()=>setSigned((window as any).AITS_SESSION.signedIn()),language=()=>setLang((window as any).AITS_I18N.language());window.addEventListener('aits-auth-expired',auth);window.addEventListener('aits-language-change',language);return()=>{window.removeEventListener('aits-auth-expired',auth);window.removeEventListener('aits-language-change',language);};},[]);
 return <div data-no-translate className="studio-page">{signed?<ContentStudio/>:<main className="studio-login"><p className="eyebrow">AITS / CONTENT STUDIO</p><h1>{t('สร้างสรรค์ ตรวจทาน เผยแพร่','Create. Review. Publish.')}</h1><p>{t('เข้าสู่ระบบ AITS ด้านบนเพื่อเปิด Content Studio โดยไม่ต้องใช้รหัสผ่านแยก','Sign in to AITS above to open Content Studio. No separate password is needed.')}</p><small>{t('ร่าง รูปภาพ และผลการค้นคว้าจากระบบเดิม · เผยแพร่เมื่อคุณอนุมัติเท่านั้น','Existing drafts, images and research · Publishing still requires your approval')}</small></main>}</div>;
}
createRoot(document.getElementById('app')!).render(<Studio/>);
