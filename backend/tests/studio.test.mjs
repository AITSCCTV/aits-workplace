import test from 'node:test';
import assert from 'node:assert/strict';
import {studioGateway,floorplanGateway} from '../studio-gateway.mjs';
import {studioIdentity} from '../studio-access.mjs';
const user={id:'owner',email:'info@aitscctv.com',admin:true,token:'verified-workspace-token'};
const req=(path,method='GET',headers={})=>new Request('https://workspace.test'+path,{method,headers});
const env=(rows=[])=>({DB_LINE_ARCHIVE:{prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}});
test('central Studio permissions preserve staff IDs, require current roles and reject service bridge identities',async()=>{
 const staff={id:'staff-1',email:'info@aitscctv.com',name:'Owner',role:'admin'};
 assert.equal((await studioIdentity(user,env([staff]),'content')).user.id,'staff-1');
 const team={...user,admin:false};
 await assert.rejects(()=>studioIdentity(team,env([]),'content'),e=>e.status===403);
 await assert.rejects(()=>studioIdentity(team,env([{...staff,role:'sales'}]),'content'),e=>e.status===403);
 assert.equal((await studioIdentity(team,env([{...staff,role:'sales'}]),'floorplan')).user.role,'sales');
 await assert.rejects(()=>studioIdentity({...user,token:null},env(),'content'),e=>e.status===403);
 await assert.rejects(()=>studioIdentity(team,env([staff,staff]),'content'),e=>e.status===403);
});
test('Content gateway forwards only verified workspace token, with fixed upstream and allowed methods',async()=>{
 let called=0;const fetcher=async(url,init)=>{called++;assert.equal(url,'https://aits-api.aits-api.workers.dev/api/admin/content-studio/drafts');assert.equal(init.headers.get('X-AITS-Workspace-Token'),user.token);assert.equal(init.headers.get('Authorization'),null);assert.equal(init.headers.get('Cookie'),null);return Response.json({drafts:[]});};
 const response=await studioGateway(req('/project-board/api/staff/admin/content-studio/drafts','GET',{'X-AITS-Staff-Token':'forged',Cookie:'private=1'}),user,fetcher);assert.equal(response.status,200);
 for(const [path,method] of [['/admin/users','GET'],['/auth/login','POST'],['/admin/content-studio/ingest','POST'],['/admin/content-studio/post','GET']])await assert.rejects(()=>studioGateway(req('/project-board/api/staff'+path,method),user,fetcher),e=>e.status===404);
 assert.equal(called,1);
 await assert.rejects(()=>studioGateway(req('/project-board/api/staff/admin/content-studio/status'),user,async()=>new Response(null,{status:302})),e=>e.status===502);
});
test('Floorplan gateway fixes destination, strips passwords and rejects unknown routes and oversized uploads',async()=>{
 const response=await floorplanGateway(req('/floorplan-studio/api/connection','GET',{Authorization:'Bearer arbitrary'}),user,async(url,init)=>{assert.equal(String(url),'https://aits-floorplan-api.onrender.com/api/connection');assert.equal(init.headers.get('X-AITS-Workspace-Token'),user.token);assert.equal(init.headers.get('Authorization'),null);return Response.json({aiReady:true});});assert.equal(response.status,200);
 await assert.rejects(()=>floorplanGateway(req('/floorplan-studio/api/delete','POST'),user),e=>e.status===404);
 await assert.rejects(()=>floorplanGateway(req('/floorplan-studio/api/preview','POST',{'Content-Length':'55000000'}),user),e=>e.status===413);
});
