import {HttpError} from './auth.mjs';
export async function studioGateway(request,user,fetcher=fetch){
 const path=new URL(request.url).pathname.replace('/project-board/api/staff','/api');
 const method=request.method;
 const allowed=(method==='GET'&&/^\/api\/admin\/content-studio\/(drafts|status|research\/[a-zA-Z0-9_-]+|media\/[a-f0-9]{32}\.jpg)$/.test(path))||
 (method==='PUT'&&path==='/api/admin/content-studio/drafts')||
 (method==='POST'&&/^\/api\/admin\/content-studio\/(research|ideas|post)$/.test(path));
 if(!allowed)throw new HttpError(404,'Studio route not found.');
 if(!user.token)throw new HttpError(401,'Workspace sign-in is required.');
 const headers=new Headers({'Content-Type':'application/json','X-AITS-Workspace-Token':user.token});
 const response=await fetcher('https://aits-api.aits-api.workers.dev'+path,{method,headers,body:method==='GET'?undefined:request.body,redirect:'manual'});
 if(response.status>=300&&response.status<400)throw new HttpError(502,'Unexpected Studio redirect.');
 const outHeaders=new Headers({'Content-Type':response.headers.get('Content-Type')||'application/json'});
 if(response.headers.has('Retry-After'))outHeaders.set('Retry-After',response.headers.get('Retry-After'));
 return new Response(response.body,{status:response.status,headers:outHeaders});
}
export async function floorplanGateway(request,user,fetcher=fetch){
 const url=new URL(request.url),path=url.pathname.replace('/floorplan-studio','');
 const allowed=(request.method==='GET'&&['/api/status','/api/connection'].includes(path))||(request.method==='POST'&&['/api/preview','/api/analyze','/api/site-survey'].includes(path));
 if(!allowed)throw new HttpError(404,'Studio route not found.');
 if(!user.token)throw new HttpError(401,'Workspace sign-in is required.');
 const headers=new Headers({'X-AITS-Workspace-Token':user.token});
 const type=request.headers.get('Content-Type');if(type)headers.set('Content-Type',type);
 const max=path==='/api/preview'?54_000_000:24_000_000;
 if(Number(request.headers.get('Content-Length'))>max)throw new HttpError(413,'Request is too large.');
 let bytes=0;
 const body=request.body?.pipeThrough(new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>max)throw new HttpError(413,'Request is too large.');controller.enqueue(chunk);}}));
 const target=new URL('https://aits-floorplan-api.onrender.com'+path);
 if(path==='/api/preview'){const page=url.searchParams.get('page');if(page!==null){if(!/^\d{1,2}$/.test(page))throw new HttpError(400,'Invalid page.');target.searchParams.set('page',page);}}
 const response=await fetcher(target,{method:request.method,headers,body,redirect:'manual',duplex:'half'});
 if(response.status>=300&&response.status<400)throw new HttpError(502,'Unexpected Studio redirect.');
 return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')||'application/json'}});
}
