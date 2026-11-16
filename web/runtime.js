(() => {
  const config = window.AITS_CONFIG;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    if (!config.apiOrigin) return Promise.resolve(new Response(JSON.stringify({error:'ยังไม่ได้เชื่อม Cloud backend — กรุณาเปิด Site เดิมเพื่ออ่านหรือบันทึกข้อมูล / Cloud backend is not connected.'}), {status:503,headers:{'Content-Type':'application/json'}}));
    const target = new URL(url.pathname + url.search, config.apiOrigin);
    return originalFetch(target, {...init, credentials:'include'});
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (config.app === 'workplace') return;
    const bar=document.createElement('aside');
    bar.setAttribute('role','status');
    bar.style.cssText='padding:12px 20px;background:#fff4df;color:#4e3713;border-bottom:1px solid #e4c684;font:15px/1.6 system-ui,sans-serif';
    const text=config.apiOrigin?'GitHub Pages · Cloud connection configured; sign-in is required for private data. ':'GitHub Pages · ยังไม่เชื่อม Cloud — '+(config.app==='design-studio'?'วาดแปลนและส่งออกไฟล์ได้ในเครื่อง':'เปิดดูหน้าจอได้ แต่ยังอ่านหรือบันทึกข้อมูลส่วนตัวไม่ได้')+' · ';
    bar.append(document.createTextNode(text));
    const link=document.createElement('a');link.href=config.original;link.textContent='เปิด Site เดิม / Open original';link.rel='noopener';link.target='_blank';bar.append(link);document.body.prepend(bar);
  });
})();
