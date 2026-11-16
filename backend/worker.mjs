import {membersApi,sessionInfo} from './members.mjs';
import {studioIdentity} from './studio-access.mjs';
import {studioGateway,floorplanGateway} from './studio-gateway.mjs';
import {runWithContext} from './context.mjs';
import {authenticate,authorize,HttpError} from './auth.mjs';
import {syncCalendars} from './calendar-sync.mjs';
import {readArchive} from './line-archive.mjs';
import {scanLine,reviewApi} from './line-review.mjs';
import * as tasks from '../sites/project-board/app/api/tasks/route.ts';
import * as projects from '../sites/project-board/app/api/projects/route.ts';
import * as warranties from '../sites/project-board/app/api/warranties/route.ts';
import * as service from '../sites/project-board/app/api/service/route.ts';
import * as forms from '../sites/project-board/app/api/forms/route.ts';
import * as mcp from '../sites/project-board/app/mcp/route.ts';
import * as stock from '../sites/inventory/app/api/stock/route.ts';
import {api as plans} from '../sites/design-studio/worker/api.js';
const routes={'/api/tasks':tasks,'/api/projects':projects,'/api/warranties':warranties,'/api/service':service,'/api/forms':forms,'/mcp':mcp};
const json=(body,status=200)=>Response.json(body,{status});
async function limitedBody(request,limit){
 if(!request.body)return undefined;
 const reader=request.body.getReader(),chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new HttpError(413,'Request is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(length);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return bytes;
}
export function createWorker(verify=authenticate){return {async scheduled(controller,env,ctx){ctx.waitUntil(Promise.allSettled([syncCalendars(env),scanLine(env)]));},async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const allowed=env.FRONTEND_ORIGIN==='https://aitscctv.github.io'?env.FRONTEND_ORIGIN:null;
 const cors=origin===allowed;
 const finish=response=>{const h=new Headers(response.headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('Vary','Origin');if(cors){h.set('Access-Control-Allow-Origin',allowed);h.set('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');h.set('Access-Control-Allow-Headers','Authorization, Content-Type');}return new Response(response.body,{status:response.status,headers:h});};
 try{
  if(origin&&origin!==allowed&&origin!==url.origin)throw new HttpError(403,'Origin not allowed.');
  if(request.method==='OPTIONS'){if(!cors)throw new HttpError(403,'Origin not allowed.');return finish(new Response(null,{status:204}));}
  if(url.pathname==='/health'&&request.method==='GET')return finish(json({service:'aits-workplace-api',authenticationConfigured:!!env.POLICY_AUD}));
  const user=await verify(request,env);
  if(url.pathname==='/auth/login'&&request.method==='GET'){
   const state=url.searchParams.get('state')||'';
   if(!/^[a-f0-9-]{36}$/.test(state)||!allowed)throw new HttpError(400,'Invalid login state.');
   const nonce=crypto.randomUUID().replaceAll('-','');
   const data=JSON.stringify({type:'aits-login',state,token:user.token,email:user.email}).replaceAll('<','\\u003c');
   const html=`<!doctype html><meta charset="utf-8"><title>AITS sign-in</title><p>Sign-in completed. You can close this window.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${data},${JSON.stringify(allowed)});window.close();}</script>`;
   return finish(new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`}}));
  }
  if(url.pathname==='/auth/me'&&request.method==='GET'){if(!user.token)throw new HttpError(403,'Workspace sign-in is required.');return finish(json(sessionInfo(user)));}
  if(url.pathname==='/project-board/api/members'){const body=await limitedBody(request,16_000);return finish(await membersApi(new Request(url.href,{method:request.method,headers:request.headers,body}),env,user));}
  const studioCheck=url.pathname.match(/^\/auth\/studio\/(content|floorplan)$/);
  if(studioCheck){if(request.method!=='GET')throw new HttpError(405,'GET is required.');return finish(json(await studioIdentity(user,env,studioCheck[1])));}
  if(url.pathname.startsWith('/floorplan-studio/')){await studioIdentity(user,env,'floorplan');return finish(await floorplanGateway(request,user));}
  if(url.pathname.startsWith('/project-board/api/staff/')){
   await studioIdentity(user,env,'content');
   const body=await limitedBody(request,500_000);
   if(!env.CONTENT_STUDIO_SERVICE)throw new HttpError(503,'Content Studio connection unavailable.');
   return finish(await studioGateway(new Request(url.href,{method:request.method,headers:request.headers,body}),user,env.CONTENT_STUDIO_SERVICE.fetch.bind(env.CONTENT_STUDIO_SERVICE)));
  }
  const match=url.pathname.match(/^\/(project-board|inventory|design-studio)(\/.*)$/);
  if(!match)throw new HttpError(404,'Not found.');
  const [,app,path]=match;authorize(user,app,path,request.method);
  if(!['GET','POST','PUT'].includes(request.method))throw new HttpError(405,'Method not allowed.');
  if(request.method!=='GET'&&!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
  const db={ 'project-board':env.DB_PROJECT_BOARD,inventory:env.DB_INVENTORY,'design-studio':env.DB_DESIGN_STUDIO}[app];
  if(!db)throw new HttpError(503,'Database not configured.');
  const headers=new Headers(request.headers);
  for(const key of [...headers.keys()])if(key.startsWith('oai-')||['authorization','cf-access-jwt-assertion','cookie','content-length','x-aits-sites-bridge'].includes(key))headers.delete(key);
  headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);
  // External origin was validated above. Original handlers execute as internal same-origin requests.
  headers.set('Origin',url.origin);
  const body=await limitedBody(request,app==='design-studio'?7_000_000:500_000);
  const internal=new Request(url.origin+path+url.search,{method:request.method,headers,body});
  const bindings={...env,DB:db,BUCKET:env.BUCKET};
  const response=await runWithContext({env:bindings,request:internal},async()=>{
   if(app==='design-studio')return plans(internal,bindings);
   if(app==='project-board'&&path==='/api/calendar'){
    if(request.method!=='GET')throw new HttpError(405,'Read-only calendar.');
    const row=await db.prepare('SELECT data FROM calendar_snapshot WHERE id=1').first();
    if(!row)return json({error:'Calendar snapshot has not been migrated yet.'},503);
    const sync=await db.prepare("SELECT status,attempted_at,success_at,error_code FROM sync_status WHERE id='calendar'").first();
    return json({...JSON.parse(row.data),sync});
   }
   if(app==='project-board'&&path==='/api/line')return readArchive(internal,env);
   if(app==='project-board'&&path==='/api/review')return reviewApi(internal,env,user);
   if(app==='project-board'&&path==='/api/sync-calendar'){
    if(request.method!=='POST')throw new HttpError(405,'POST is required.');
    const result=await syncCalendars(env);return json(result,result.status==='error'?503:200);
   }
   if(app==='project-board'&&path==='/api/sync-status'){
    if(request.method!=='GET')throw new HttpError(405,'Read-only status.');
    return json({calendar:await db.prepare("SELECT status,attempted_at,success_at,error_code FROM sync_status WHERE id='calendar'").first(),line:env.DB_LINE_ARCHIVE?'live_archive':'not_configured'});
   }
   const route=app==='inventory'?(path==='/api/stock'?stock:null):routes[path];
   if(!route)throw new HttpError(404,'Not found.');
   if(!route[request.method])throw new HttpError(405,'Method not allowed.');
   return route[request.method](internal);
  });return finish(response);
 }catch(e){return finish(json({error:e instanceof HttpError?e.message:'The service could not complete this request.'},e instanceof HttpError?e.status:500));}
}};}
export default createWorker();
