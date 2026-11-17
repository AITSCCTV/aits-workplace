import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {briefPeriod,summarizeBoard,generateBrief,weeklyBriefApi,scheduledBrief} from '../weeklybrief.mjs';
import {briefSources} from '../weeklybrief-sources.mjs';
const now=new Date('2026-11-16T01:00:00Z'),user={email:'manager@example.com',token:'test',tools:['weeklybrief','tasks','line','calendar']};
function environment(){
 const sql=new DatabaseSync(':memory:');for(const path of ['sites/project-board/drizzle/0000_flowery_the_professor.sql','backend/migrations/assistant.sql','backend/migrations/members.sql','backend/migrations/accounts.sql','backend/migrations/remove-members.sql','backend/migrations/weeklybrief.sql'])sql.exec(readFileSync(path,'utf8'));
 const wrap=(q,a=[])=>({bind(...args){return wrap(q,args)},async first(){return sql.prepare(q).get(...a)||null},async all(){return {results:sql.prepare(q).all(...a)}},async run(){const stmt=sql.prepare(q);return stmt.columns().length?{results:stmt.all(...a),meta:{changes:0}}:{meta:{changes:stmt.run(...a).changes}}}});
 return {OPENAI_API_KEY:'test',ASSISTANT_MONTHLY_USD:'5',DB_PROJECT_BOARD:{sql,prepare:q=>wrap(q),async batch(qs){sql.exec('BEGIN');try{const results=[];for(const q of qs)results.push(await q.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}}};
}
const task=(id,data)=>({id,data:JSON.stringify(data),updated:now.toISOString()});
test('external evidence is bounded, dated, cited and protected by both source permissions',async()=>{
 const e=environment(),db=e.DB_PROJECT_BOARD;e.DB_LINE_ARCHIVE=db;
 db.sql.exec('CREATE TABLE customers(id TEXT,real_name TEXT,name TEXT); CREATE TABLE conversations(id TEXT,customer_id TEXT,sender TEXT,message TEXT,message_type TEXT,timestamp TEXT); CREATE TABLE calendar_snapshot(id INTEGER,data TEXT);');
 db.sql.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run('message-1','customer-1','customer','Installation is delayed','text','2026-11-15T10:00:00Z');
 db.sql.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run('old','customer-1','customer','Old message','text','2026-10-01T10:00:00Z');
 db.sql.prepare('INSERT INTO calendar_snapshot VALUES(1,?)').run(JSON.stringify({asOf:'2026-11-15T01:00:00Z',calendars:8,events:[{id:'event-1',title:'Site visit',start:'2026-11-18',end:'2026-11-19',calendar:'Team'}]}));
 const sources=await briefSources(e,briefPeriod(now),now);assert.equal(sources.line.records.length,1);assert.equal(sources.calendar.stale,true);assert.equal(sources.calendar.records.length,1);
 const provider=async(url,options)=>{const b=JSON.parse(options.body),input=JSON.parse(b.input);assert.equal(input.externalSources.length,2);assert.equal(b.tools,undefined);return Response.json({usage:{input_tokens:100,output_tokens:50},output:[{content:[{type:'output_text',text:JSON.stringify({highlights:[],agenda:[],updates:[{text:'Review a reported delay.',taskIds:[],sourceIds:['line:message-1']}]})}]}]})};
 const r=await generateBrief(e,user,'en',false,provider,now);assert.equal(r.ai.status,'ready');assert.equal(r.ai.updates.length,1);assert.equal(r.requestCostUsd,r.ai.costUsd);
 for(const missing of ['line','calendar'])await assert.rejects(weeklyBriefApi(new Request('https://local/api/weeklybrief?id='+r.id),e,{...user,tools:user.tools.filter(t=>t!==missing)}),err=>err.status===403);
 const fake=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({highlights:[],agenda:[],updates:[{text:'False',taskIds:[],sourceIds:['line:missing']}]})}]}]});
 assert.equal((await generateBrief(e,user,'th',false,fake,now)).ai.status,'unavailable');
});
test('Bangkok weeks handle Sunday UTC, year boundaries and exact Monday cutoff',()=>{
 assert.equal(briefPeriod(new Date('2026-11-15T17:01:00Z')).week,'2026-11-16');
 assert.equal(briefPeriod(new Date('2026-11-15T16:59:00Z')).week,'2026-11-09');
 assert.equal(briefPeriod(new Date('2027-01-01T01:00:00Z')).week,'2026-12-28');
 assert.equal(briefPeriod(now).from,'2026-11-08T17:00:00.000Z');
});
test('counts use task state and completion transitions, deduplicate history and disclose unmatched owners',()=>{
 const rows=[task('a',{title:'Overdue',status:'doing',due:'2026-11-15',owner:'Kai + Unknown'}),task('b',{status:'waiting',owner:'',due:'2026-11-16'}),task('c',{status:'done',owner:'Kai'})];
 const event=(id,at,before,after)=>({task_id:id,at,data:JSON.stringify({before,after})});
 const events=[event('c','2026-11-10T00:00:00.000Z',{status:'doing'},{status:'done',owner:'Kai',title:'Done'}),event('c','2026-11-11T00:00:00.000Z',{status:'done'},{status:'done'}),event('a','2026-11-15T16:59:00.000Z',{status:'doing'},{status:'done',owner:'Kai'}),event('b','2026-11-15T17:00:00.000Z',{status:'doing'},{status:'done'}),event('import','2026-11-12T00:00:00.000Z',null,{status:'done'})];
 const r=summarizeBoard(rows,events,[{email:'kai@example.com',label:'Kai',aliases:'["Kai"]'},{email:'empty@example.com',label:'No work',aliases:'[]'}],now);
 assert.deepEqual(r.stats,{total:3,unfinished:2,overdue:1,ongoing:1,attention:1,completedLastWeek:2});
 assert.equal(r.unassigned.length,1);assert.equal(r.unmatched.length,1);assert.equal(r.workload[0].outstanding.length,1);assert.equal(r.workload[0].completed.length,2);assert.equal(r.workload[1].outstanding.length,0);assert.equal(r.issues[0].reason,'');
});
test('generation caches requests, reserves usage and rejects invented task citations',async()=>{
 const e=environment();let calls=0;const provider=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);return Response.json({usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:'output_text',text:JSON.stringify({highlights:[{text:'No recorded tasks.',taskIds:[]}],agenda:[]})}]}]})};
 const first=await generateBrief(e,user,'en',false,provider,now);assert.equal(first.ai.status,'ready');assert.equal(first.stats.total,0);
 const cached=await generateBrief(e,user,'en',false,provider,now);assert.equal(cached.requestCostUsd,0);assert.equal(cached.cached,true);assert.deepEqual(cached.stats,first.stats);assert.equal(calls,1);
 await assert.rejects(generateBrief(e,user,'en',true,provider,now),err=>err.status===429);
 const bad=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({highlights:[{text:'Fake',taskIds:['invented']}],agenda:[]})}]}]});
 const second=await generateBrief(e,user,'th',false,bad,now);assert.equal(second.ai.status,'unavailable');assert.equal(second.ai.highlights.length,0);
});
test('permissions are enforced for history/share and budget failure still returns accurate board counts',async()=>{
 const e=environment();e.ASSISTANT_MONTHLY_USD='0';let calls=0;
 e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO tasks VALUES(?,?,1,?)').run('t1',JSON.stringify({status:'doing',title:'Real task'}),now.toISOString());
 const r=await generateBrief(e,user,'th',false,()=>{calls++},now);assert.equal(calls,0);assert.equal(r.stats.ongoing,1);assert.equal(r.ai.status,'unavailable');
 for(const tools of [[],['tasks'],['weeklybrief']])await assert.rejects(weeklyBriefApi(new Request('https://local/api/weeklybrief?id='+r.id),e,{...user,tools}),err=>err.status===403);
 assert.equal((await weeklyBriefApi(new Request('https://local/api/weeklybrief?id='+r.id),e,user)).status,200);
 await scheduledBrief({WEEKLYBRIEF_ENABLED:'true'},new Date('2026-11-17T01:00:00Z'));
 await scheduledBrief({WEEKLYBRIEF_ENABLED:'false'},now);
});
test('too many records fails rather than publishing partial totals',async()=>{
 const e=environment(),insert=e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO tasks VALUES(?,?,1,?)');for(let n=0;n<1001;n++)insert.run(String(n),'{}',now.toISOString());
 await assert.rejects(generateBrief(e,user,'en',false,()=>{throw Error('must not call')},now),err=>err.status===413);
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT status FROM weekly_briefs').get().status,'failed');
});
