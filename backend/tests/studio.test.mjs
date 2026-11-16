import test from 'node:test';
import assert from 'node:assert/strict';
import {studioGateway} from '../studio-gateway.mjs';
const req=(path,method='GET',headers={})=>new Request('https://workspace.test/project-board/api/staff'+path,{method,headers});
test('Studio gateway only forwards allowed routes and staff credentials to fixed upstream',async()=>{
 let called=0;
 const fetcher=async(url,init)=>{called++;assert.equal(url,'https://aits-api.aits-api.workers.dev/api/admin/content-studio/drafts');assert.equal(init.headers.get('Authorization'),'Bearer staff-session');assert.equal(init.headers.get('Cookie'),null);assert.equal(init.redirect,'manual');return Response.json({drafts:[]});};
 const response=await studioGateway(req('/admin/content-studio/drafts','GET',{'X-AITS-Staff-Token':'staff-session',Authorization:'Bearer workspace-session',Cookie:'private=1'}),fetcher);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{drafts:[]});assert.equal(called,1);
 for(const [path,method] of [['/admin/users','GET'],['/admin/content-studio/ingest','POST'],['/admin/content-studio/post','GET'],['/admin/content-studio/drafts','DELETE']])await assert.rejects(()=>studioGateway(req(path,method),fetcher),e=>e.status===404);
 assert.equal(called,1);
});
test('Studio login failures preserve workspace session and missing staff sessions never reach upstream',async()=>{
 await assert.rejects(()=>studioGateway(req('/admin/content-studio/status'),()=>{throw Error('must not call')}),e=>e.status===403);
 const response=await studioGateway(req('/auth/login','POST'),async()=>Response.json({error:'Invalid credentials'},{status:401}));assert.equal(response.status,403);
 await assert.rejects(()=>studioGateway(req('/auth/login','POST'),async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}})),e=>e.status===502);
});
