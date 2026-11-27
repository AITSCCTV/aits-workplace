import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {instructionDefaults,readStudioInstructions,saveStudioInstructions,validateInstructions} from '../content-studio-instructions.mjs';
import {createWorker} from '../dist/worker.js';
function database(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('backend/migrations/content-studio-instructions.sql','utf8'));sql.exec('CREATE TABLE staff(id TEXT,name TEXT,email TEXT,role TEXT)');const wrap=(q,args=[])=>({bind(...a){return wrap(q,a)},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}});return {prepare:q=>wrap(q)};}
test('versioned instructions preserve history, reject stale saves and protected fields',async()=>{
 const db=database();assert.equal((await readStudioInstructions(db)).revision,0);
 const next={...instructionDefaults,research:'Research PoE for Thai homeowners.'};
 assert.equal((await saveStudioInstructions(db,{revision:0,instructions:next},'marketing@example.com')).status,200);
 assert.equal((await saveStudioInstructions(db,{revision:0,instructions:instructionDefaults},'other@example.com')).status,409);
 assert.equal((await saveStudioInstructions(db,{revision:1,instructions:{...next,outputFormat:'text'}},'editor')).status,400);
 assert.equal((await saveStudioInstructions(db,{revision:1,instructions:next,postingEnabled:true},'editor')).status,400);
 assert.throws(()=>validateInstructions({...next,writing:'x'.repeat(6001)}));
 assert.equal((await saveStudioInstructions(db,{revision:1,instructions:instructionDefaults},'marketing@example.com')).status,200);
 const current=await readStudioInstructions(db,true);assert.equal(current.revision,2);assert.equal(current.history[1].instructions.research,next.research);assert.equal(current.updatedBy,'marketing@example.com');
});
test('Workspace API requires content access and a session, accepts marketing editor and rejects cross-origin writes',async()=>{
 const env={DB_LINE_ARCHIVE:database(),FRONTEND_ORIGIN:'https://aitscctv.github.io'};
 const user={email:'marketing@example.com',id:'m',tools:['content-studio'],token:'verified',admin:false};
 const request=(method='GET',origin=env.FRONTEND_ORIGIN)=>new Request('https://api.test/project-board/api/staff/admin/content-studio/instructions',{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({revision:0,instructions:instructionDefaults})}:{})});
 assert.equal((await createWorker(async()=>user).fetch(request('PUT'),env)).status,200);
 assert.equal((await createWorker(async()=>({...user,tools:[]})).fetch(request(),env)).status,403);
 assert.equal((await createWorker(async()=>({...user,token:null})).fetch(request(),env)).status,403);
 assert.equal((await createWorker(async()=>user).fetch(request('PUT','https://evil.test'),env)).status,403);
});
test('machine instructions read stays behind ingest authentication and cannot deliver drafts', {skip:!process.env.STUDIO_TEST_BUNDLE},async()=>{
 const code=fs.readFileSync(process.env.STUDIO_TEST_BUNDLE,'utf8');const source=code.slice(code.indexOf('async function ingest(request2,'),code.indexOf('__name(ingest,'));
 let reads=0;const context=vm.createContext({ingestAuthorized:async()=>false,readStudioJson:async()=>({instructionsRead:true}),readStudioInstructions:async()=>{reads++;return {revision:2,instructions:instructionDefaults}},validateDraft:()=>{throw Error('Must not ingest or publish');}});vm.runInContext(source,context);
 const json=(b,status=200)=>({b,status});assert.equal((await context.ingest({}, {},json)).status,401);assert.equal(reads,0);
 context.ingestAuthorized=async()=>true;const result=await context.ingest({}, {},json);assert.equal(result.b.revision,2);assert.equal(reads,1);
});
