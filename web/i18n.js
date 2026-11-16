(() => {
  'use strict';
  const catalog=window.AITS_EN||{};
  const preference='aits-workplace-language';
  let language='th';
  try{if(localStorage.getItem(preference)==='en')language='en';}catch{}
  const privateStrings=new Set();
  const mixedPhrases=Object.keys(catalog).filter(s=>/[a-zA-Z.]/.test(s)&&/[\u0e00-\u0e7f]/.test(s)).sort((a,b)=>b.length-a.length);
  const thai=/[\u0e00-\u0e7f]+(?:[ \t]+[\u0e00-\u0e7f]+)*/g;
  const originalText=new WeakMap(), originalAttributes=new WeakMap();
  const thShell={
    'Sign in to AITS':'เข้าสู่ระบบ AITS','Sign out':'ออกจากระบบ','Open original Site':'เปิด Site เดิม',
    'AITS · Sign in to read and save private records':'AITS · เข้าสู่ระบบเพื่ออ่านและบันทึกข้อมูลส่วนตัว',
    'Please sign in to AITS using the button above.':'กรุณาเข้าสู่ระบบ AITS ด้วยปุ่มด้านบน',
    'Please allow the sign-in popup.':'กรุณาอนุญาตหน้าต่างเข้าสู่ระบบ',
    'Sign-in timed out. Please try again.':'หมดเวลาเข้าสู่ระบบ กรุณาลองใหม่',
    'Please sign in to AITS.':'กรุณาเข้าสู่ระบบ AITS',
    'Sign-in expired or invalid. Please sign in again.':'การเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
    'This account is not authorized for AITS.':'บัญชีนี้ไม่ได้รับสิทธิ์เข้าใช้ AITS',
    'The service could not complete this request.':'ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่',
    'Page not found':'ไม่พบหน้า','Return to AITS Workplace':'กลับสู่ AITS Workplace'
  };
  function translate(text){
    if(language==='th')return thShell[text]||text;
    // Only known interface phrases are translated. Names and free-text records are retained.
    if(privateStrings.has(text))return text;
    if(catalog[text])return catalog[text];
    let parts=[{text,private:false}];
    for(const value of privateStrings){if(value.length<2||!text.includes(value))continue;
      parts=parts.flatMap(p=>p.private?[p]:p.text.split(value).flatMap((s,i)=>i?[{text:value,private:true},{text:s,private:false}]:[{text:s,private:false}]));
    }
    return parts.map(p=>{if(p.private)return p.text;let value=p.text;for(const phrase of mixedPhrases)value=value.split(phrase).join(catalog[phrase]);value=value.replace(/พบ (\d+) แบบ/g,(_,n)=>'Found '+n+' plan'+(n==='1'?'':'s'));return value.replace(thai,s=>catalog[s]||catalog[s.replace(/[ \t]+/g,' ')]||s);}).join('');
  }
  function protectData(value,key=''){
    if(typeof value==='string'){
      if(/^(name|title|customer|customerName|client|site|siteName|location|description|notes?|summary|job|assignee|ownerName|contact|contactName|evidence|source|subject|reporter|operator|trainer|trainee|address|next|nextAction)$/i.test(key)&&/[\u0e00-\u0e7f]/.test(value))privateStrings.add(value);
    }else if(Array.isArray(value))value.forEach(v=>protectData(v,key));
    else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))protectData(v,k);
  }
  function textNode(node){
    const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,[data-no-translate], [contenteditable="true"]'))return;
    const current=node.nodeValue,previous=originalText.get(node);
    const source=previous&&current===previous.rendered?previous.source:current;
    const rendered=translate(source);originalText.set(node,{source,rendered});
    if(current!==rendered)node.nodeValue=rendered;
  }
  function element(el){
    if(el.closest('script,style,[data-no-translate]'))return;
    // Implicit option values must remain Thai because the APIs use the original enum values.
    if(el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',el.textContent);
    let saved=originalAttributes.get(el);if(!saved){saved={};originalAttributes.set(el,saved);}
    for(const attr of ['placeholder','title','aria-label','alt']){
      const current=el.getAttribute(attr);if(current===null)continue;
      const prev=saved[attr],source=prev&&current===prev.rendered?prev.source:current,rendered=translate(source);
      saved[attr]={source,rendered};if(current!==rendered)el.setAttribute(attr,rendered);
    }
  }
  function walk(root){
    if(root.nodeType===Node.TEXT_NODE){textNode(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    element(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode()))node.nodeType===Node.TEXT_NODE?textNode(node):element(node);
  }
  let observer;
  function apply(){if(!document.body)return;observer?.disconnect();walk(document.body);document.documentElement.lang=language;observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']});}
  window.AITS_I18N={translate,protectData,locale:()=>language==='en'?'en-GB':'th-TH',language:()=>language};
  for(const name of ['alert','confirm','prompt']){const native=window[name].bind(window);window[name]=(message,...args)=>native(translate(String(message)),...args);}
  document.addEventListener('DOMContentLoaded',()=>{
    document.addEventListener('change',event=>{const el=event.target;if((el.tagName==='TEXTAREA'||el.tagName==='INPUT'&&['text','search'].includes(el.type))&&/[\u0e00-\u0e7f]/.test(el.value))privateStrings.add(el.value);},true);
    const toolbar=document.createElement('nav');toolbar.setAttribute('aria-label','Language / ภาษา');toolbar.dataset.noTranslate='';
    toolbar.style.cssText='display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:8px 20px;background:#122e2b;color:white;font:14px system-ui;position:relative;z-index:10000';
    toolbar.innerHTML='<span>ภาษา / Language</span><button type="button" lang="th">ไทย</button><button type="button" lang="en">English</button>';
    for(const [i,b]of [...toolbar.querySelectorAll('button')].entries()){
      const lang=i?'en':'th';b.setAttribute('aria-pressed',String(language===lang));
      b.style.cssText='padding:6px 14px;border:1px solid #b6d1c8;border-radius:6px;cursor:pointer;background:'+(language===lang?'#d6f4e8':'#fff')+';color:#12352e';
      b.onclick=()=>{if(language===lang)return;language=lang;try{localStorage.setItem(preference,lang);}catch{}
        for(const button of toolbar.querySelectorAll('button')){const active=button.lang===lang;button.setAttribute('aria-pressed',String(active));button.style.background=active?'#d6f4e8':'#fff';}
        apply();window.dispatchEvent(new CustomEvent('aits-language-change',{detail:{language}}));
      };
    }
    document.body.prepend(toolbar);
    observer=new MutationObserver(records=>{observer.disconnect();for(const record of records){if(record.type==='childList')for(const n of record.addedNodes)walk(n);else if(record.type==='characterData')textNode(record.target);else element(record.target);}observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']});});
    apply();
  });
})();
