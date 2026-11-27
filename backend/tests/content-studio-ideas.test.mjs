import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {createStudioIdea} from '../content-studio-ideas.mjs';
import {studioGateway} from '../studio-gateway.mjs';
import {patchIdeaWorkflow} from '../../scripts/content-studio-idea-workflow.mjs';
import {editorialStyle,matchesEditorialFilter} from '../../studios/content/editorial.mjs';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE content_studio_runs(id TEXT PRIMARY KEY,payload TEXT,recorded_at TEXT)');const wrap=(q,args=[])=>({bind(...a){return wrap(q,a)},async first(){return sql.prepare(q).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}});return {prepare:q=>wrap(q)};}
const idea={prompt:'Explain how PoE CCTV helps a small shop.',style:'EDUCATIONAL',requestId:'a'.repeat(32)};
const env=()=>({DB:database(),CONTENT_STUDIO_RESEARCH_WEBHOOK:'https://aitscctv.app.n8n.cloud/webhook/aits-content-studio-research'});
test('ideas validate input and cannot configure protected fields or arbitrary destinations',async()=>{
 const e=env(),never=()=>{throw Error('Must not trigger')};
 for(const input of [{...idea,prompt:'short'},{...idea,prompt:'x'.repeat(4001)},{...idea,style:'PUBLISH'},{...idea,requestId:'bad'},{...idea,postingEnabled:true}])assert.equal((await createStudioIdea(input,e,'a',never)).status,400);
 assert.equal((await createStudioIdea(idea,{...e,CONTENT_STUDIO_RESEARCH_WEBHOOK:'https://evil.test'},'a',never)).status,503);
});
test('one-time requests are idempotent, stored with actor, and cannot be overwritten',async()=>{
 const e=env();let calls=0;const trigger=async(url,init)=>{calls++;assert.equal(url,e.CONTENT_STUDIO_RESEARCH_WEBHOOK);assert.deepEqual(JSON.parse(init.body),{researchId:'manual_idea_'+idea.requestId});return new Response('{}');};
 assert.equal((await createStudioIdea(idea,e,'ceo',trigger)).status,202);
 assert.equal((await createStudioIdea(idea,e,'ceo',trigger)).status,202);assert.equal(calls,1);
 assert.equal((await createStudioIdea({...idea,prompt:'A different request completely'},e,'ceo',trigger)).status,409);
 assert.equal((await createStudioIdea(idea,e,'other',trigger)).status,409);
 assert.equal((await createStudioIdea({...idea,requestId:'b'.repeat(32)},e,'ceo',trigger)).status,429);
 const row=await e.DB.prepare('SELECT payload FROM content_studio_runs WHERE id=?').bind('manual_idea_'+idea.requestId).first();assert.equal(JSON.parse(row.payload).ideaPrompt,idea.prompt);
});
test('ambiguous webhook failure cannot mark an already claimed job failed',async()=>{
 const e=env();const result=await createStudioIdea(idea,e,'ceo',async()=>{await e.DB.prepare("UPDATE content_studio_runs SET payload=json_set(payload,'$.stage','RESEARCHING')").run();throw Error('Network lost');});assert.equal(result.status,202);
 const failed=await createStudioIdea(idea,env(),'ceo',async()=>{throw Error('Unavailable')});assert.equal(failed.status,502);
});
test('idea endpoint requires the existing Workspace session and uses the fixed service',async()=>{
 const request=new Request('https://workspace.test/project-board/api/staff/admin/content-studio/ideas',{method:'POST',body:JSON.stringify(idea)});
 await assert.rejects(()=>studioGateway(request,{}));
 const response=await studioGateway(request,{token:'session'},async(url,init)=>{assert.equal(url,'https://aits-api.aits-api.workers.dev/api/admin/content-studio/ideas');assert.equal(init.headers.get('X-AITS-Workspace-Token'),'session');return Response.json({id:'manual_idea_'+idea.requestId},{status:202});});assert.equal(response.status,202);
});
test('one-time drafts appear in All Drafts and their chosen style filter',()=>{const d={id:'ideaedu_'+'a'.repeat(32),status:'DRAFT'};assert.equal(editorialStyle(d),'EDUCATIONAL');assert.ok(matchesEditorialFilter(d,'ALL'));assert.ok(matchesEditorialFilter(d,'EDUCATIONAL'));assert.equal(editorialStyle({id:'ideamarketing_'+'b'.repeat(32)}),'MARKETING');});
test('live workflow patch isolates idea IDs, preserves schedules, and keeps protected model contracts',{skip:!process.env.STUDIO_IDEA_WORKFLOW},()=>{
 const w=JSON.parse(fs.readFileSync(process.env.STUDIO_IDEA_WORKFLOW,'utf8')),nodes=patchIdeaWorkflow(w),node=name=>nodes.find(n=>n.name===name)||w.nodes.find(n=>n.name===name);
 const runConfig=input=>new Function('$json','$execution',node('MI Configuration').parameters.jsCode)(input,{mode:'production',id:'test'})[0].json;
 const normal=runConfig({}),one=runConfig({researchId:'manual_idea_'+idea.requestId,ideaPrompt:idea.prompt,editorialStyle:'EDUCATIONAL'});
 assert.equal(normal.oneTimeIdea,false);assert.match(normal.editorialSlot,/^(EDUCATIONAL|MARKETING)_\d{4}-\d{2}-\d{2}$/);assert.equal(one.editorialSlot,'IDEA_manual_idea_'+idea.requestId);assert.equal(one.preview,false);
 assert.throws(()=>runConfig({ideaPrompt:idea.prompt,researchId:'invalid',editorialStyle:'EDUCATIONAL'}));
 one.aiInstructions={revision:2,instructions:{research:'Focus on shops',monday:'Teach clearly',thursday:'Compare fairly',writing:'Plain Thai'}};one.history=[];one.candidates=[];one.verified=[];one.registry={};
 for(const name of ['Build Research Request','Build Verification Request','Build Content Request']){
  const original=w.nodes.find(n=>n.name===name);const state={...one,deadline:Date.now()+60000};
  const before=new Function('$json',original.parameters.jsCode)({state:structuredClone(state)})[0].json.request;
  const after=new Function('$json',node(name).parameters.jsCode)({state:structuredClone(state)})[0].json.request;
  assert.deepEqual(after.text.format,before.text.format);assert.equal(after.model,before.model);assert.ok(after.input.some(i=>i.content.includes('oneTimeIdea')));assert.ok(after.instructions.lastIndexOf('PROTECTED CONTRACT')>after.instructions.lastIndexOf('ONE-TIME IDEA'));assert.ok(after.instructions.includes('02-878-2951 ext. 100'));
 }
 const state={...one,rows:[{kind:'CONTENT',status:'PENDING_REVIEW',data:{card:{instagram:{},editorialSlot:normal.editorialSlot}}},{kind:'CONTENT',status:'PENDING_REVIEW',data:{card:{instagram:{},editorialSlot:one.editorialSlot}}}]};
 const delivery=new Function('$json',node('Prepare Draft Packages').parameters.jsCode)({state});assert.equal(delivery.length,1);assert.equal(delivery[0].json.card.editorialSlot,one.editorialSlot);
 assert.equal(nodes.some(n=>n.name==='Image Generation'),false);assert.equal(nodes.some(n=>/08:00/.test(n.name)),false);
 const verifier=node('Validate Verification').parameters.jsCode.split('\nconst p=unpack')[0];
 const url='https://aitscctv.com/cctv-camera-service/';
 const check={id:'E01',verdict:'VERIFIED',countryCode:'TH',locationTH:'ประเทศไทย',publishedAt:new Date().toISOString(),eventKey:'revisit topic',kind:'SEARCH_OBSERVATION',serviceId:'CCTV',fit:9,needScore:8,timeliness:8,claims:[{id:'E01-C1',textTH:'บริการติดตั้งกล้อง',sourceUrls:[url]}],sourceGroups:[],newDevelopmentTH:''};
 const verifyState={...one,registry:{[url.slice(0,-1)]:{url}},history:[{eventKey:'revisit topic',claimKey:'old',urls:[url]}]};
 const accept=new Function('candidate','state',verifier+'\nreturn acceptVerified(candidate,state);');
 assert.ok(accept(check,verifyState));assert.equal(accept(check,{...verifyState,oneTimeIdea:false}),null);assert.equal(accept(check,{...verifyState,registry:{}}),null);
});
test('shared ingest retrieves stored idea only after authentication and claims it once',{skip:!process.env.STUDIO_TEST_BUNDLE},async()=>{
 const code=fs.readFileSync(process.env.STUDIO_TEST_BUNDLE,'utf8'),source=code.slice(code.indexOf('async function ingest(request2,'),code.indexOf('__name(ingest,'));const e=env();await createStudioIdea(idea,e,'ceo',async()=>new Response('{}'));
 const ctx=vm.createContext({ingestAuthorized:async()=>false,readStudioJson:async()=>({researchCheck:'manual_idea_'+idea.requestId,ideaPrompt:'override'}),studioId:{parse:x=>x},validateDraft:()=>{throw Error('Must not ingest')}});vm.runInContext(source,ctx);const json=(body,status=200)=>({body,status});
 assert.equal((await ctx.ingest({},e,json)).status,401);ctx.ingestAuthorized=async()=>true;
 const result=await ctx.ingest({},e,json);assert.equal(result.body.ideaPrompt,idea.prompt);assert.equal(result.body.editorialStyle,'EDUCATIONAL');assert.equal((await ctx.ingest({},e,json)).status,409);
});
test('shared route denies unauthenticated requests and reports delivered ideas as review drafts',{skip:!process.env.STUDIO_TEST_BUNDLE},async()=>{
 const code=fs.readFileSync(process.env.STUDIO_TEST_BUNDLE,'utf8'),start=code.indexOf('async function handleContentStudioAdminRoutes('),source=code.slice(start,code.indexOf('__name(handleContentStudioAdminRoutes,',start));
 const e=env();await e.DB.prepare('CREATE TABLE content_studio_drafts(id TEXT PRIMARY KEY,status TEXT)').run();
 const ctx=vm.createContext({URL,Date,JSON,Response,ADMIN:'/api/admin/content-studio',__name:x=>x,canAccessContentStudio:r=>r==='marketing',studioId:{parse:x=>x},failure:e=>{throw e},readStudioJson:async()=>({...idea,postingEnabled:true}),createStudioIdea});vm.runInContext(source,ctx);
 const url=new URL('https://api.test/api/admin/content-studio/ideas'),request=new Request(url,{method:'POST'}),json=(body,status=200)=>Response.json(body,{status});
 assert.equal((await ctx.handleContentStudioAdminRoutes(request,url,e,null,json)).status,401);
 assert.equal((await ctx.handleContentStudioAdminRoutes(request,url,e,{auth_source:'workspace',role:'marketing',email:'ceo'},json)).status,400);
 const created=await createStudioIdea(idea,e,'ceo',async()=>new Response('{}'));const id=created.body.id,draftId='ideaedu_'+idea.requestId;
 await e.DB.prepare('INSERT INTO content_studio_runs VALUES(?,?,?)').bind('report_DAILY_'+id,JSON.stringify({cards:[{contentId:draftId}]}),new Date().toISOString()).run();
 await e.DB.prepare("INSERT INTO content_studio_drafts VALUES(?,'DRAFT')").bind(draftId).run();
 const statusUrl=new URL('https://api.test/api/admin/content-studio/research/'+id);
 const response=await ctx.handleContentStudioAdminRoutes(new Request(statusUrl),statusUrl,e,{auth_source:'workspace',role:'marketing',email:'ceo'},json);const status=await response.json();assert.equal(status.stage,'COMPLETE');assert.deepEqual(status.draftIds,[draftId]);
 const job=await e.DB.prepare('SELECT payload FROM content_studio_runs WHERE id=?').bind(id).first();assert.equal(JSON.parse(job.payload).stage,'COMPLETE');
 assert.equal((await createStudioIdea({...idea,requestId:'b'.repeat(32)},e,'ceo',async()=>new Response('{}'))).status,202);
});
