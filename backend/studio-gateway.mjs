import {HttpError} from './auth.mjs';
// Fixed upstream and route/method allowlist. Existing staff authentication and
// publishing authorization remain authoritative; workspace Access is additional.
export async function studioGateway(request, fetcher=fetch) {
 const path=new URL(request.url).pathname.replace('/project-board/api/staff','/api');
 const method=request.method;
 const allowed=(method==='POST'&&/^\/api\/auth\/(login|refresh)$/.test(path))||
  (method==='GET'&&/^\/api\/admin\/content-studio\/(drafts|status|research\/[a-zA-Z0-9_-]+|media\/[a-f0-9]{32}\.jpg)$/.test(path))||
  (method==='PUT'&&path==='/api/admin/content-studio/drafts')||
  (method==='POST'&&/^\/api\/admin\/content-studio\/(research|post)$/.test(path));
 if(!allowed)throw new HttpError(404,'Studio route not found.');
 const headers=new Headers({'Content-Type':'application/json'});
 const token=request.headers.get('X-AITS-Staff-Token');
 if(token)headers.set('Authorization','Bearer '+token);
 if(path!=='/api/auth/login'&&!token)throw new HttpError(403,'Please sign in with your Content Studio staff account.');
 const response=await fetcher('https://aits-api.aits-api.workers.dev'+path,{method,headers,body:method==='GET'?undefined:request.body,redirect:'manual'});
 if(response.status>=300&&response.status<400)throw new HttpError(502,'Unexpected Studio redirect.');
 // Staff expiry must not invalidate the independent workspace Access session.
 const outHeaders=new Headers({'Content-Type':response.headers.get('Content-Type')||'application/json'});
 if(response.headers.has('Retry-After'))outHeaders.set('Retry-After',response.headers.get('Retry-After'));
 return new Response(response.body,{status:response.status===401?403:response.status,headers:outHeaders});
}
