import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,SignJWT} from 'jose';
import {authenticate} from '../auth.mjs';
import {createWorker} from '../dist/worker.js';
const origin='https://aitscctv.github.io';
function database(files){const sql=new DatabaseSync(':memory:');for(const file of files)sql.exec(readFileSync(file,'utf8'));const wrap=(query,args=[])=>({bind(...values){return wrap(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}}}});return {sql,prepare:query=>wrap(query),async batch(queries){sql.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};}
function environment(){const objects=new Map();return {FRONTEND_ORIGIN:origin,ADMIN_EMAILS:'info@aitscctv.com',TEAM_EMAILS:'team@example.com',TEAM_DOMAIN:'https://aits-test.cloudflareaccess.com',POLICY_AUD:'test-audience',DB_PROJECT_BOARD:database(['sites/project-board/drizzle/0000_flowery_the_professor.sql','sites/project-board/drizzle/0001_mute_silver_sable.sql','backend/migrations/calendar.sql']),DB_INVENTORY:database(['sites/inventory/drizzle/0000_overrated_corsair.sql']),DB_DESIGN_STUDIO:database(['sites/design-studio/drizzle/0000_smiling_hobgoblin.sql']),BUCKET:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null,delete:async k=>objects.delete(k)}};}
const req=(path,method='GET',body,extra={})=>new Request('https://api.example'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
const admin={id:'verified-owner',email:'info@aitscctv.com',admin:true,token:'signed-token'};
const worker=createWorker(async()=>admin);
test('unconfigured and unauthenticated requests fail closed even with spoofed Sites headers',async()=>{const w=createWorker(),e=environment();e.POLICY_AUD='';assert.equal((await w.fetch(req('/inventory/api/stock'),e)).status,503);e.POLICY_AUD='test';assert.equal((await w.fetch(req('/inventory/api/stock','GET',undefined,{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'info@aitscctv.com'}),e)).status,401)});
test('JWT verifies signature, issuer, audience, expiry and authorized email',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');const e=environment();
 const sign=(data={},aud=e.POLICY_AUD,issuer=e.TEAM_DOMAIN,expiry='1h')=>new SignJWT({email:'info@aitscctv.com',...data}).setProtectedHeader({alg:'RS256'}).setSubject('verified-owner').setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime(expiry).sign(privateKey);
 const verify=async token=>authenticate(req('/x','GET',undefined,{Authorization:'Bearer '+token}),e,publicKey);
 assert.equal((await verify(await sign())).admin,true);
 await assert.rejects(verify(await sign({},'wrong')),/invalid/);
 await assert.rejects(verify(await sign({},e.POLICY_AUD,'https://wrong.cloudflareaccess.com')),/invalid/);
 await assert.rejects(verify(await sign({},e.POLICY_AUD,e.TEAM_DOMAIN,1)),/invalid/);
 await assert.rejects(verify(await sign({email:'outsider@example.com'})),/not authorized/);
 assert.equal((await verify(await sign({email:'team@example.com'}))).admin,false);
 const foreign=await generateKeyPair('RS256');const forged=await new SignJWT({email:'info@aitscctv.com'}).setProtectedHeader({alg:'RS256'}).setSubject('verified-owner').setIssuedAt().setIssuer(e.TEAM_DOMAIN).setAudience(e.POLICY_AUD).setExpirationTime('1h').sign(foreign.privateKey);await assert.rejects(verify(forged),/invalid/);
});
test('CORS denies other sites; preflight never accesses private data',async()=>{const e=environment();let r=await worker.fetch(req('/inventory/api/stock','OPTIONS'),e);assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);r=await worker.fetch(req('/inventory/api/stock','GET',undefined,{Origin:'https://evil.example'}),e);assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null)});
test('inventory persists exact quantities and isolates owners, ignoring forged identity headers',async()=>{
 const e=environment();let r=await worker.fetch(req('/inventory/api/stock','POST',{action:'add',sku:'TEST',name:'Cable',min:null,unit:'เมตร',decimals:3,revision:-1},{'oai-authenticated-user-id':'attacker'}),e);assert.equal(r.status,200);const d=await r.json();assert.equal(d.items.length,1);assert.equal(e.DB_INVENTORY.sql.prepare('SELECT owner FROM trial_state').get().owner,admin.id);
 r=await worker.fetch(req('/inventory/api/stock','POST',{action:'move',item:d.items[0].id,qty:'0.3',type:'รับเข้า',job:'test',revision:d.revision}),e);assert.equal(r.status,200);
 const other=createWorker(async()=>({...admin,id:'other-owner'}));assert.deepEqual((await (await other.fetch(req('/inventory/api/stock'),e)).json()).items,[]);
 r=await worker.fetch(req('/inventory/api/stock','POST',{action:'add',sku:'SECOND',name:'Test',unit:'ชิ้น',decimals:0,min:null,revision:-1}),e);assert.equal(r.status,409);
});
test('board tasks persist and stale revisions do not overwrite',async()=>{const e=environment();const r=await worker.fetch(req('/project-board/api/tasks','POST',{title:'Migration test',status:'todo'}),e);assert.equal(r.status,200);const {task}=await r.json();assert.equal((await (await worker.fetch(req('/project-board/api/tasks'),e)).json()).tasks.length,1);assert.equal((await worker.fetch(req('/project-board/api/tasks','POST',{...task,revision:0,title:'Wrong update'}),e)).status,400);assert.equal((await (await worker.fetch(req('/project-board/api/tasks'),e)).json()).tasks[0].title,'Migration test')});
test('team role cannot read board, inventory, plans or MCP',async()=>{const w=createWorker(async()=>({...admin,admin:false,email:'team@example.com'})),e=environment();for(const path of ['/project-board/api/tasks','/inventory/api/stock','/design-studio/api/plans','/project-board/mcp'])assert.equal((await w.fetch(req(path),e)).status,403)});
test('Design Studio retains R2 saves and revision-conflict behavior through gateway',async()=>{const e=environment(),id=crypto.randomUUID(),plan={version:1,name:'Test plan',scale:25,bg:null,walls:[],devices:[]};assert.equal((await worker.fetch(req('/design-studio/api/plans','POST',{id,plan}),e)).status,201);const saved=await(await worker.fetch(req('/design-studio/api/plans/'+id),e)).json();assert.equal(saved.plan.name,plan.name);assert.equal((await worker.fetch(req('/design-studio/api/plans/'+id,'PUT',{plan,revision:2}),e)).status,409)});
test('missing private snapshot reports unavailable rather than an empty calendar',async()=>{assert.equal((await worker.fetch(req('/project-board/api/calendar'),environment())).status,503)});
test('login bridge requires nonce and never puts tokens in URL; restrictive CSP',async()=>{const e=environment();assert.equal((await worker.fetch(req('/auth/login'),e)).status,400);const r=await worker.fetch(req('/auth/login?state='+crypto.randomUUID()),e);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/postMessage/)});

test('Sites bridge is secret-authenticated and scoped only to board operations',async()=>{
 const e=environment();e.SITES_BRIDGE_TOKEN='a'.repeat(64);
 const request=(path,token=e.SITES_BRIDGE_TOKEN,origin)=>new Request('https://api.example'+path,{headers:{'X-AITS-Sites-Bridge':token,...(origin?{Origin:origin}:{})}});
 assert.equal((await authenticate(request('/project-board/mcp'),e)).email,'info@aitscctv.com');
 for(const path of ['/auth/login','/inventory/api/stock','/design-studio/api/plans','/project-board/api/migration-export'])await assert.rejects(authenticate(request(path),e),/Invalid/);
 await assert.rejects(authenticate(request('/project-board/api/tasks','b'.repeat(64)),e),/Invalid/);
 await assert.rejects(authenticate(request('/project-board/api/tasks',e.SITES_BRIDGE_TOKEN,'https://aitscctv.github.io'),e),/Invalid/);
 e.SITES_BRIDGE_TOKEN='';await assert.rejects(authenticate(request('/project-board/api/tasks','a'.repeat(64)),e),/Invalid/);
});
