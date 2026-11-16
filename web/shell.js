(()=>{
 const config=window.AITS_CONFIG,base=config.base;
 const routes=[['','ภาพรวม','Overview','M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],['project-board/','บอร์ดงาน','Task board','M4 5h16v15H4zM8 3v4m8-4v4M8 11h8m-8 4h5'],['project-board/projects/','โครงการ','Projects','M3 7h7l2-3h9v16H3z'],['project-board/calendar/','ปฏิทิน','Calendar','M4 6h16v14H4zM8 3v6m8-6v6M4 11h16'],['project-board/review/','ตรวจข้อเสนอ','Review queue','M4 4h16v16H4zM8 12l3 3 5-6'],['project-board/line/','บทสนทนา LINE','LINE conversations','M4 4h16v13H9l-5 4zM8 8h8m-8 4h5'],['design-studio/','สตูดิโอออกแบบ','Design studio','m15 4 5 5-11 11H4v-5zM13 6l5 5'],['floorplan-studio/','สตูดิโอแปลน','Floorplan Studio','M3 3h18v18H3zM3 10h8V3m0 7v11m0-7h10'],['content-studio/','สตูดิโอคอนเทนต์','Content Studio','M4 3h16v18H4zM8 7h8m-8 4h8m-8 4h5'],['inventory/','คลังอุปกรณ์','Inventory','m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11'],['project-board/service/','บริการและประกัน','Service & warranty','M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7zM8 12l3 3 5-6']];
 const t=(th,en)=>window.AITS_I18N.language()==='en'?en:th;
 const icon=path=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="'+path+'"/></svg>';
 document.addEventListener('DOMContentLoaded',()=>{
  document.body.classList.add('aits-ui');document.body.dataset.aitsApp=config.app;
  const sidebar=document.createElement('nav');sidebar.className='aits-sidebar';sidebar.dataset.noTranslate='';
  const menu=document.createElement('button');menu.className='aits-mobile-menu';menu.type='button';menu.innerHTML=icon('M4 6h16M4 12h16M4 18h16');menu.setAttribute('aria-expanded','false');
  const toggle=()=>{const open=document.body.classList.toggle('aits-menu-open');menu.setAttribute('aria-expanded',String(open))};menu.onclick=toggle;
  const palette=document.createElement('dialog');palette.className='aits-command';palette.dataset.noTranslate='';
  function openSearch(){palette.showModal();palette.querySelector('input').focus()}
  function render(){
   const current=location.pathname.replace(base,'');
   sidebar.setAttribute('aria-label',t('เมนูหลัก','Main navigation'));menu.setAttribute('aria-label',t('เปิดเมนู','Open menu'));
   sidebar.innerHTML='<a class="aits-wordmark" href="'+base+'"><span class="aits-mark">A</span><span>AITS<small>WORKSPACE</small></span><span class="aits-wordmark-dot"></span></a><button class="aits-search-trigger">'+icon('m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0')+'<span>'+t('ค้นหาเครื่องมือ','Find a tool')+'</span><kbd>Ctrl K</kbd></button><div class="aits-nav-label">'+t('พื้นที่ทำงาน','WORKSPACE')+'</div><div class="aits-nav-list">'+routes.map(([path,th,en,d])=>'<a href="'+base+path+'" '+((current===path||current===path+'index.html')?'aria-current="page"':'')+'>'+icon(d)+'<span>'+t(th,en)+'</span></a>').join('')+'</div><div class="aits-sidebar-bottom"><div class="aits-nav-label">'+t('เริ่มต้นงาน','CAPTURE')+'</div><a href="'+base+'project-board/forms/sales/">'+t('รับความต้องการลูกค้า','Customer brief')+'<span>↗</span></a><a href="'+base+'project-board/forms/survey/">'+t('แบบสำรวจหน้างาน','Site survey')+'<span>↗</span></a><div class="aits-owner"><span>AT</span><div>'+t('พื้นที่ทำงานส่วนตัว','Private workspace')+'<small>'+t('สิทธิ์พนักงานยังไม่เปิดใช้','Employee access not enabled')+'</small></div></div></div>';
   sidebar.querySelector('.aits-search-trigger').onclick=openSearch;
   palette.innerHTML='<div class="aits-command-input">'+icon('m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0')+'<input type="search" aria-label="'+t('ค้นหาเครื่องมือ','Find a tool')+'" placeholder="'+t('ต้องการทำอะไรต่อ?','Where would you like to go?')+'"><button aria-label="'+t('ปิด','Close')+'">Esc</button></div><div class="aits-command-results"></div><footer>'+t('ค้นหาเครื่องมือ · กด Esc เพื่อปิด','Search tools · Esc to close')+'</footer>';
   const input=palette.querySelector('input'),results=palette.querySelector('.aits-command-results');
   function find(){const value=input.value.toLowerCase();const matches=routes.filter(r=>(r[1]+' '+r[2]).toLowerCase().includes(value));results.replaceChildren();if(!matches.length){const p=document.createElement('p');p.textContent=t('ไม่พบเครื่องมือ','No matching tools');results.append(p)}for(const [path,th,en,d]of matches){const a=document.createElement('a');a.href=base+path;a.innerHTML=icon(d);const label=document.createElement('span');label.textContent=t(th,en);a.append(label);results.append(a)}}
   input.oninput=find;input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('a')?.focus()}if(e.key==='Enter')results.querySelector('a')?.click()};palette.querySelector('button').onclick=()=>palette.close();find();
  }
  palette.addEventListener('click',e=>{if(e.target===palette)palette.close()});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(palette.open)palette.close();else openSearch()}if(e.key==='Escape'&&palette.open){e.preventDefault();palette.close()}if(e.key==='Escape'&&document.body.classList.contains('aits-menu-open'))toggle()});
  document.body.prepend(sidebar,menu);document.body.append(palette);render();window.addEventListener('aits-language-change',render);
 });
})();
