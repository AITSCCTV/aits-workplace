import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,SignJWT} from 'jose';
import {authenticate} from '../auth.mjs';
import {createWorker} from '../dist/worker.js';
import {syncCalendars,fetchCalendarSnapshot} from '../calendar-sync.mjs';
import {readArchive} from '../line-archive.mjs';
import {scanLine,suggestMessage,approveReview,reviewApi} from '../line-review.mjs';
const origin='https://aitscctv.github.io';
function database(files){const sql=new DatabaseSync(':memory:');for(const file of files)sql.exec(readFileSync(file,'utf8'));const wrap=(query,args=[])=>({bind(...values){return wrap(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}}}});return {sql,prepare:query=>wrap(query),async batch(queries){sql.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};}
function environment(){const objects=new Map();return {FRONTEND_ORIGIN:origin,ADMIN_EMAILS:'info@aitscctv.com',TEAM_EMAILS:'team@example.com',TEAM_DOMAIN:'https://aits-test.cloudflareaccess.com',POLICY_AUD:'test-audience',DB_PROJECT_BOARD:database(['sites/project-board/drizzle/0000_flowery_the_professor.sql','sites/project-board/drizzle/0001_mute_silver_sable.sql','backend/migrations/calendar.sql','backend/migrations/sync.sql','backend/migrations/review.sql']),DB_INVENTORY:database(['sites/inventory/drizzle/0000_overrated_corsair.sql']),DB_DESIGN_STUDIO:database(['sites/design-studio/drizzle/0000_smiling_hobgoblin.sql']),BUCKET:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null,delete:async k=>objects.delete(k)}};}
const req=(path,method='GET',body,extra={})=>new Request('https://api.example'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
const admin={id:'verified-owner',email:'info@aitscctv.com',admin:true,token:'signed-token'};
const worker=createWorker(async()=>admin);

function archive(){const db=database([]);db.sql.exec('CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,real_name TEXT);CREATE TABLE conversations(id TEXT PRIMARY KEY,customer_id TEXT,message TEXT,message_type TEXT,sender TEXT,timestamp TEXT);');db.sql.prepare('INSERT INTO customers VALUES(?,?,?)').run('customer','Test Customer','');return db;}
const message=(id='message')=>({id,customer_id:'customer',customer_name:'Test Customer',message:'Please schedule the installation visit next week.',message_type:'text',sender:'user',timestamp:'2026-11-16T00:00:00Z'});
async function proposal(e,id='message'){const source=message(id);await e.DB_PROJECT_BOARD.prepare('INSERT INTO line_review(id,source,proposal,created_at) VALUES(?,?,?,?)').bind(id,JSON.stringify(source),JSON.stringify(suggestMessage(source)),source.timestamp).run();}
test('LINE scanning generates pending evidence only, excludes bots and attachments, and resumes without duplicates',async()=>{
 const e=environment();e.DB_LINE_ARCHIVE=archive();
 for(const [id,sender,type,text] of [['one','user','text','Please schedule the installation next week.'],['bot','bot','text','Please schedule the installation next week.'],['image','staff','image','Please schedule the installation next week.'],['thanks','user','text','Thank you so much for your help.']])e.DB_LINE_ARCHIVE.sql.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(id,'customer',text,type,sender,'2026-11-16T00:00:00Z');
 const now=new Date('2026-11-16T00:00:00Z');assert.equal((await scanLine(e,now)).created,1);assert.equal((await scanLine(e,now)).status,'already_attempted');
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM tasks').get().n,0);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM progress_projects').get().n,0);
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT state FROM line_review').get().state,'pending');
 e.DB_LINE_ARCHIVE.sql.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run('two','customer','Please repair the camera when possible.','text','staff','2026-10-01T00:00:00Z');
 assert.equal((await scanLine(e,new Date(now.getTime()+900000))).created,1);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM line_review').get().n,2);
});
test('review approval creates one task with evidence and audit; replay cannot create a duplicate',async()=>{
 const e=environment();await proposal(e);const input={id:'message',kind:'create_task',title:'Reviewed installation',customer:'Test Customer',next:'Confirm date',status:'todo'};
 const result=await approveReview(e.DB_PROJECT_BOARD,input,admin);assert.equal(result.state,'applied');assert.equal(result.revision,1);
 const task=e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM tasks').get();assert.match(JSON.parse(task.data).evidence,/Please schedule/);assert.equal(JSON.parse(task.data).due,'');assert.equal(JSON.parse(task.data).owner,'');
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM events').get().n,1);
 await assert.rejects(approveReview(e.DB_PROJECT_BOARD,input,admin),/already been reviewed/);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM tasks').get().n,1);
});
test('review rejects stale target versions without marking applied; successful task update preserves fields',async()=>{
 const e=environment();await proposal(e);const old={title:'Existing',customer:'Customer',next:'Before',status:'doing',owner:'Technician',due:'2026-11-30',evidence:'Original evidence',quoteStage:'waiting'};
 e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO tasks VALUES(?,?,?,?)').run('task',JSON.stringify(old),2,'2026-11-16');
 const input={id:'message',kind:'update_task',targetId:'task',revision:1,title:'Existing',customer:'Customer',next:'Reviewed next step',status:'waiting'};
 await assert.rejects(approveReview(e.DB_PROJECT_BOARD,input,admin),/task changed/);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT state FROM line_review').get().state,'pending');
 await approveReview(e.DB_PROJECT_BOARD,{...input,revision:2},admin);const data=JSON.parse(e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM tasks').get().data);assert.equal(data.owner,old.owner);assert.equal(data.due,old.due);assert.equal(data.quoteStage,'waiting');assert.match(data.evidence,/Original evidence/);assert.equal(data.next,'Reviewed next step');
});
test('project review appends notes while preserving quantities, costs and progress; dismissal changes no work',async()=>{
 const e=environment();await proposal(e);const project={name:'Project',notes:'Existing note',sites:[{id:'site',stages:[{actual:3,total:10}]}],workspace:{costs:[{amount:100}]}};
 e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO progress_projects VALUES(?,?,?,?)').run('project',JSON.stringify(project),1,'2026-11-16');
 await approveReview(e.DB_PROJECT_BOARD,{id:'message',kind:'project_note',targetId:'project',revision:1,note:'Reviewed scheduling note'},admin);
 const result=JSON.parse(e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM progress_projects').get().data);assert.deepEqual(result.sites,project.sites);assert.deepEqual(result.workspace,project.workspace);assert.match(result.notes,/Existing note/);assert.match(result.notes,/Reviewed scheduling note/);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM progress_history').get().n,1);
 await proposal(e,'dismiss');await reviewApi(req('/api/review','POST',{action:'dismiss',id:'dismiss'}),e,admin);assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) AS n FROM tasks').get().n,0);
 const team=createWorker(async()=>({...admin,admin:false}));assert.equal((await team.fetch(req('/project-board/api/review','POST',{action:'approve'}),e)).status,403);
 assert.equal((await createWorker().fetch(req('/project-board/api/review'),e)).status,401);
});

test('calendar sync atomically replaces cancellations and failed reads preserve last good data; duplicate runs are bounded',async()=>{
 const e=environment();e.GOOGLE_SERVICE_ACCOUNT_JSON='test';
 await e.DB_PROJECT_BOARD.prepare('INSERT INTO calendar_snapshot VALUES(1,?)').bind(JSON.stringify({events:[{id:'removed'}]})).run();
 let calls=0;const ok=async()=>{calls++;return Response.json({items:[{id:'new',summary:'Meeting',start:{date:'2026-11-16'},end:{date:'2026-11-17'}},{id:'cancelled',status:'cancelled'}]});};
 const now=new Date('2026-11-16T00:00:00Z'),options={now,tokenProvider:async()=> 'test',fetcher:ok};
 assert.equal((await syncCalendars(e,options)).status,'ok');assert.equal(calls,8);
 const good=e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM calendar_snapshot').get().data;
 const parsed=JSON.parse(good);assert.equal(parsed.events.length,8);assert.equal(new Set(parsed.events.map(x=>x.id)).size,8);assert.ok(parsed.events.every(x=>x.start==='2026-11-16'&&x.end==='2026-11-17'));
 assert.equal((await syncCalendars(e,options)).status,'already_attempted');assert.equal(calls,8);
 const failed=await syncCalendars(e,{...options,now:new Date(now.getTime()+900000),fetcher:async()=>new Response('',{status:403})});assert.equal(failed.status,'error');
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM calendar_snapshot').get().data,good);
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT status FROM sync_status').get().status,'error');
});
test('calendar page cap refuses incomplete data',async()=>{let calls=0;await assert.rejects(fetchCalendarSnapshot('token',new Date(),async()=>{calls++;return Response.json({items:[],nextPageToken:'more'})}),/calendar_page_limit/);assert.equal(calls,3)});
test('LINE archive keyset pagination handles equal timestamps, scopes conversations and refuses writes',async()=>{
 const db=database([]);db.sql.exec('CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,real_name TEXT);CREATE TABLE conversations(id TEXT PRIMARY KEY,customer_id TEXT,message TEXT,message_type TEXT,sender TEXT,timestamp TEXT);');
 db.sql.prepare('INSERT INTO customers VALUES(?,?,?)').run('one','Customer','');
 for(let i=0;i<105;i++)db.sql.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(String(i).padStart(3,'0'),i%2?'one':'two','message','text','user','2026-11-16 10:00:00');
 const env={DB_LINE_ARCHIVE:db};let data=await(await readArchive(req('/api/line'),env)).json();assert.equal(data.messages.length,50);
 const second=await(await readArchive(req('/api/line?cursor='+encodeURIComponent(data.nextCursor)),env)).json();assert.equal(second.messages.length,50);assert.equal(new Set([...data.messages,...second.messages].map(m=>m.id)).size,100);
 const third=await(await readArchive(req('/api/line?cursor='+encodeURIComponent(second.nextCursor)),env)).json();assert.equal(third.messages.length,5);assert.equal(third.nextCursor,null);
 data=await(await readArchive(req('/api/line?customer=one'),env)).json();assert.ok(data.messages.every(m=>m.customer_id==='one'));assert.equal(data.messages[0].customer_name,'Customer');
 await assert.rejects(readArchive(req('/api/line?cursor=bad'),env),/Invalid cursor/);await assert.rejects(readArchive(req('/api/line','POST',{}),env),/Read-only/);
 const e=environment();e.DB_LINE_ARCHIVE=db;assert.equal((await createWorker(async()=>({...admin,admin:false})).fetch(req('/project-board/api/line'),e)).status,403);
 assert.equal((await createWorker().fetch(req('/project-board/api/line'),e)).status,401);
});
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
