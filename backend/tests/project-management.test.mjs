import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {projectManagementApi} from '../project-management.mjs';
import {summarizeBoard} from '../weeklybrief.mjs';
function environment(){const sql=new DatabaseSync(':memory:');for(const file of ['sites/project-board/drizzle/0000_flowery_the_professor.sql','sites/project-board/drizzle/0001_mute_silver_sable.sql','backend/migrations/members.sql','backend/migrations/accounts.sql','backend/migrations/remove-members.sql','backend/migrations/weeklybrief.sql','backend/migrations/project-management.sql'])sql.exec(readFileSync(file,'utf8'));const wrap=(q,a=[])=>({bind(...v){return wrap(q,v)},async first(){return sql.prepare(q).get(...a)||null},async all(){return {results:sql.prepare(q).all(...a)}},async run(){const s=sql.prepare(q);return s.columns().length?{results:s.all(...a),meta:{changes:0}}:{meta:{changes:s.run(...a).changes}}}});return {DB_PROJECT_BOARD:{sql,prepare:q=>wrap(q),async batch(qs){sql.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await q.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}}}}
const employee={email:'employee@example.com',token:'test',admin:false,tools:[]};
const req=b=>new Request('https://local/api/project-management',b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:undefined);
function seed(e){e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO workspace_members(email,tools,enabled,revision,updated_at,updated_by) VALUES(?,?,1,1,?,?)').run(employee.email,'[]','now','owner');}
const draft={operation:'task',revision:0,title:'Install camera',description:'Check coverage',status:'todo',priority:'high',startDate:'',endDate:'',projectId:'',parentId:'',assigneeIds:[]};
async function save(e,b){return (await projectManagementApi(req(b),e,employee)).json()}
test('all enabled employees can create shared projects and assigned tasks; nonmembers and disabled accounts cannot',async()=>{
 const e=environment();seed(e);
 const project=await save(e,{operation:'project',revision:0,name:'Camera rollout',customer:'Sample',notes:'Plan'});
 const task=await save(e,{...draft,projectId:project.id,assigneeIds:[employee.email]});
 const result=await save(e);assert.equal(result.projects[0].id,project.id);assert.equal(result.tasks[0].projectId,project.id);assert.deepEqual(result.tasks[0].assigneeIds,[employee.email]);assert.equal(result.tasks[0].owner,employee.email);
 await assert.rejects(projectManagementApi(req(),e,{...employee,email:'outsider@example.com'}),err=>err.status===403);
 e.DB_PROJECT_BOARD.sql.prepare('UPDATE workspace_members SET enabled=0').run();await assert.rejects(projectManagementApi(req(),e,employee),err=>err.status===403);
});
test('subtask cycles, invalid dates, missing projects and invalid assignees are rejected',async()=>{
 const e=environment();seed(e);const parent=await save(e,draft),child=await save(e,{...draft,title:'Subtask',parentId:parent.id});
 await assert.rejects(save(e,{...draft,id:parent.id,revision:1,parentId:child.id}),err=>err.status===400);
 for(const fields of [{startDate:'2026-02-30'},{startDate:'2026-12-01',endDate:'2026-11-01'},{parentId:'missing'},{projectId:'missing'},{assigneeIds:['outsider@example.com']}])await assert.rejects(save(e,{...draft,...fields}),err=>err.status===400);
 const rows=await save(e);assert.equal(rows.tasks.length,2);assert.equal(rows.tasks.find(t=>t.id===child.id).parentId,parent.id);
});
test('edits preserve legacy fields, metadata and audit; stale writes do not create false completion history',async()=>{
 const e=environment();seed(e);const db=e.DB_PROJECT_BOARD.sql;
 db.prepare('INSERT INTO tasks VALUES(?,?,1,?)').run('legacy',JSON.stringify({title:'Existing',owner:'Unconfirmed owner note',status:'waiting',evidence:'Private evidence',quoteRef:'Q1',projectRef:'Free text reference'}),'now');
 await save(e,{...draft,id:'legacy',revision:1,title:'Updated'});
 let stored=JSON.parse(db.prepare("SELECT data FROM tasks WHERE id='legacy'").get().data);assert.equal(stored.evidence,'Private evidence');assert.equal(stored.owner,'Unconfirmed owner note');assert.equal(stored.projectRef,'Free text reference');
 await assert.rejects(save(e,{operation:'status',id:'legacy',revision:1,status:'done'}),err=>err.status===409);
 assert.equal(db.prepare('SELECT count(*) n FROM events').get().n,1);
 await save(e,{operation:'status',id:'legacy',revision:2,status:'done'});
 const event=JSON.parse(db.prepare('SELECT data FROM events ORDER BY at DESC LIMIT 1').get().data);assert.equal(event.before.status,'todo');assert.equal(event.after.status,'done');assert.equal(event.actor,employee.email);
 assert.equal(db.prepare("SELECT count(*) n FROM pm_task_details WHERE task_id='legacy'").get().n,1);
});
test('new-task retry is idempotent and project edits preserve progress, quotation and inventory data',async()=>{
 const e=environment();seed(e);const clientId=crypto.randomUUID();await save(e,{...draft,clientId});await save(e,{...draft,clientId});assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) n FROM tasks').get().n,1);
 const data={name:'Original',sites:[{id:'site',stages:[]}],quote:{ref:'Q'},workspace:{materials:[{name:'Camera'}]}};
 e.DB_PROJECT_BOARD.sql.prepare('INSERT INTO progress_projects VALUES(?,?,1,?)').run('project',JSON.stringify(data),'now');
 await save(e,{operation:'project',id:'project',revision:1,name:'Renamed',customer:'',notes:''});const updated=JSON.parse(e.DB_PROJECT_BOARD.sql.prepare("SELECT data FROM progress_projects WHERE id='project'").get().data);assert.deepEqual(updated.workspace,data.workspace);assert.deepEqual(updated.quote,data.quote);assert.deepEqual(updated.sites,data.sites);
});
test('a write-time conflict cannot overwrite another edit or insert a false audit event',async()=>{
 const e=environment();seed(e);const created=await save(e,draft),batch=e.DB_PROJECT_BOARD.batch.bind(e.DB_PROJECT_BOARD);
 e.DB_PROJECT_BOARD.batch=async queries=>{e.DB_PROJECT_BOARD.sql.prepare("UPDATE tasks SET data=json_set(data,'$.title','Other employee edit'),revision=revision+1 WHERE id=?").run(created.id);return batch(queries)};
 await assert.rejects(save(e,{...draft,id:created.id,revision:1,title:'Stale edit'}),err=>err.status===409);
 const row=e.DB_PROJECT_BOARD.sql.prepare('SELECT data FROM tasks WHERE id=?').get(created.id);assert.equal(JSON.parse(row.data).title,'Other employee edit');assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT count(*) n FROM events').get().n,1);
});
test('explicitly created completed PM tasks count in WeeklyBrief without counting imported completion guesses',()=>{
 const events=[{task_id:'done',at:'2026-11-10T01:00:00.000Z',data:JSON.stringify({before:null,after:{title:'Finished',status:'done'},source:'project-management'})},{task_id:'imported',at:'2026-11-10T01:00:00.000Z',data:JSON.stringify({before:null,after:{status:'done'}})}];
 assert.equal(summarizeBoard([],events,[],new Date('2026-11-16T01:00:00Z')).stats.completedLastWeek,1);
});
