(() => {
  const config=window.AITS_CONFIG;
  const originalFetch=window.fetch.bind(window);
  const api=config.apiOrigin?new URL(config.apiOrigin):null;
  const key=api?'aits-session:'+api.origin:'';
  let session=null;
  try{session=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
  let identity=null;
  const account={signedIn:()=>!!session?.token,info:()=>identity,can:tool=>!!identity&&(identity.admin||identity.tools.includes(tool))};
  window.AITS_SESSION=account;
  account.attachment=async({id,name,mime,inline,scope})=>{
    if(!session?.token||!api)throw Error('Please sign in to AITS.');
    if(!('serviceWorker' in navigator))throw Error('Use a current browser with secure downloads enabled.');
    const registration=await navigator.serviceWorker.register(scope+'files-sw.js',{scope});
    const worker=registration.active||registration.installing||registration.waiting;
    if(worker.state!=='activated')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Secure download setup timed out. Please try again.')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve()}})});
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Reload Team Chat to enable secure downloads.')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()},{once:true})});
    const target=new URL('/project-board/api/messaging',api);target.searchParams.set('action','file');target.searchParams.set('id',id);
    return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>reject(Error('Secure download timed out.')),10000);channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(e.data.url)};worker.postMessage({type:'chat-file',url:target.href,token:session.token,name,mime,inline},[channel.port2])});
  };
  account.auth=async(path,data)=>{const response=await originalFetch(new URL(path,api),{method:'POST',headers:{'Content-Type':'application/json',...(session?.token?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify(data),credentials:'omit',redirect:'error'});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to sign in.');return result;};
  account.accept=value=>{session={token:value.token,email:value.email};sessionStorage.setItem(key,JSON.stringify(session));const entry=new URL(location.href);location.replace(entry.searchParams.get('workspace-entry')==='1'&&entry.pathname.startsWith(config.base)?entry.pathname+entry.search+entry.hash:config.base+'navigation/');};
  account.clear=()=>{navigator.serviceWorker?.controller?.postMessage({type:'chat-clear'});session=null;sessionStorage.removeItem(key);location.reload();};
  account.options=api?originalFetch(new URL('/auth/options',api),{credentials:'omit'}).then(r=>r.json()).catch(()=>({password:false,google:false})):Promise.resolve({password:false,google:false});
  account.ready=(async()=>{
    if(!session?.token||!api)return null;
    try{const r=await originalFetch(new URL('/auth/me',api),{headers:{Authorization:'Bearer '+session.token},credentials:'omit',redirect:'error'});
      if(r.ok)identity=await r.json();else if(r.status===401||r.status===403){session=null;sessionStorage.removeItem(key);}
    }catch{}
    window.dispatchEvent(new Event('aits-session-ready'));return identity;
  })();
  const failure=(message,status)=>Promise.resolve(new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json'}}));
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,init);
    if(!api)return failure('Cloud backend is not connected. Please use the original Site.',503);
    if(!session?.token)return failure('Please sign in to AITS using the button above.',401);
    const target=new URL(api.href.replace(/\/$/,'')+url.pathname+url.search);
    const source=new Request(input,init);
    const headers=new Headers(source.headers);headers.set('Authorization','Bearer '+session.token);
    const response=await originalFetch(target,{method:source.method,headers,body:['GET','HEAD'].includes(source.method)?undefined:await source.arrayBuffer(),signal:source.signal,credentials:'omit',redirect:'error'});
    if(window.AITS_I18N&&response.headers.get('content-type')?.includes('application/json'))try{window.AITS_I18N.protectData(await response.clone().json());}catch{}
    if(response.status===401){identity=null;session=null;sessionStorage.removeItem(key);window.dispatchEvent(new Event('aits-auth-expired'));}
    return response;
  };
  document.addEventListener('DOMContentLoaded',()=>{


    const bar=document.createElement('aside');bar.className='workspace-account';bar.setAttribute('role','status');
    bar.style.cssText='padding:12px 20px;background:#fff4df;color:#4e3713;border-bottom:1px solid #e4c684;font:15px/1.6 system-ui,sans-serif;display:flex;gap:12px;flex-wrap:wrap;align-items:center';
    const status=document.createElement('span');bar.append(status);
    const login=document.createElement('button');login.textContent='Sign in to AITS';login.type='button';
    const logout=document.createElement('button');logout.textContent='Sign out';logout.type='button';
    const refresh=()=>{status.textContent=api?(session?'AITS · '+session.email:'AITS · Sign in to read and save private records'):'GitHub Pages · Cloud not connected. '+(config.app==='design-studio'?'Local drawing and exports are available.':'Private records cannot yet be loaded or saved.');login.hidden=!api||!!session;logout.hidden=!session;};
    logout.onclick=async()=>{try{await account.auth('/auth/logout',{})}catch{}account.clear();};
    account.googleLogin=()=>{
      const state=crypto.randomUUID(),url=new URL('/auth/login',api);url.searchParams.set('state',state);
      const popup=window.open(url,'aits-sign-in','popup,width=540,height=720');
      if(!popup){status.textContent='Please allow the sign-in popup.';return;}
      const receive=e=>{
        if(e.origin!==api.origin||e.source!==popup||e.data?.type!=='aits-login'||e.data.state!==state)return;
        if(typeof e.data.token!=='string'||typeof e.data.email!=='string')return;
        window.removeEventListener('message',receive);clearTimeout(timeout);
        account.accept(e.data);
      };
      window.addEventListener('message',receive);
      const timeout=setTimeout(()=>{window.removeEventListener('message',receive);status.textContent='Sign-in timed out. Please try again.';},300000);
    };
    login.onclick=()=>window.AITS_OPEN_LOGIN?window.AITS_OPEN_LOGIN():account.googleLogin();
    window.addEventListener('aits-auth-expired',refresh);window.addEventListener('aits-session-ready',refresh);bar.append(login,logout);
    const link=document.createElement('a');link.href=config.original;link.textContent='Open original Site';link.rel='noopener';link.target='_blank';bar.append(link);if(config.app==='project-board'){const archive=document.createElement('a');archive.href=config.base+'project-board/line/';archive.textContent='LINE · คลังข้อความ';bar.append(archive);}refresh();document.body.prepend(bar);
  });
})();
