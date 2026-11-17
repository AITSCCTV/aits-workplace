import {HttpError} from './auth.mjs';
const parse=s=>JSON.parse(s);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const validDate=v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export async function projectManagementApi(request,env,user){
 const db=env.DB_PROJECT_BOARD;
 if(!user.token)throw new HttpError(403,'Sign in with an employee account.');
 const member=await db.prepare('SELECT enabled,removed_at FROM workspace_members WHERE email=?').bind(user.email).first();
 if(!user.admin&&(!member?.enabled||member.removed_at))throw new HttpError(403,'An enabled employee account is required.');
 const people=async()=>(await db.prepare('SELECT m.email,coalesce(p.label,m.email) AS name FROM workspace_members m LEFT JOIN weeklybrief_people p ON m.email=p.email WHERE m.enabled=1 AND m.removed_at IS NULL ORDER BY name').all()).results;
 if(request.method==='GET'){
  const result=await db.batch([db.prepare('SELECT id,data,revision,updated FROM tasks ORDER BY updated DESC LIMIT 5001'),db.prepare('SELECT * FROM pm_task_details'),db.prepare('SELECT id,data,revision,updated FROM progress_projects ORDER BY updated DESC LIMIT 1001')]);
  if(result[0].results.length>5000||result[2].results.length>1000)throw new HttpError(413,'Too many records to display safely. Contact the administrator.');
  const projects=result[2].results.map(r=>{const d=parse(r.data);return {id:r.id,name:d.name,customer:d.customer||'',notes:d.notes||'',revision:r.revision,updated:r.updated}}),projectIds=new Set(projects.map(p=>p.id)),meta=new Map(result[1].results.map(m=>[m.task_id,m]));
  const tasks=result[0].results.map(r=>{const d=parse(r.data),m=meta.get(r.id);return {id:r.id,title:d.title||'',status:d.status||'todo',owner:d.owner||'',description:d.next||'',priority:d.priority||'normal',endDate:d.due||'',startDate:m?.start_date||'',projectId:m?.project_id??(projectIds.has(d.projectRef)?d.projectRef:''),parentId:m?.parent_id||'',assigneeIds:m?parse(m.assignees):[],revision:r.revision,updated:r.updated}});
  return Response.json({tasks,projects,people:await people()});
 }
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
 let b;try{b=await request.json()}catch{throw new HttpError(400,'Invalid JSON.');}
 if(!b||!['task','status','project'].includes(b.operation))throw new HttpError(400,'Unknown operation.');
 if(!Number.isInteger(b.revision)||b.revision<0)throw new HttpError(400,'Invalid revision.');
 const id=b.id||b.clientId||crypto.randomUUID();if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw new HttpError(400,'Invalid record ID.');
 const table=b.operation==='project'?'progress_projects':'tasks';
 const old=await db.prepare(`SELECT data,revision FROM ${table} WHERE id=?`).bind(id).first();
 if(old&&!b.id&&b.clientId)return Response.json({id,revision:old.revision});
 if((old?.revision||0)!==b.revision||(!old&&b.id))throw new HttpError(409,'This record changed. Reload before saving.');
 const state=await db.prepare('SELECT revision FROM pm_state WHERE id=1').first(),prior=old?parse(old.data):{},data={...prior},at=new Date().toISOString(),auditId=crypto.randomUUID(),revision=(old?.revision||0)+1;
 let metadata;
 if(b.operation==='project'){
  data.name=clean(b.name,300);data.customer=clean(b.customer,300);data.notes=clean(b.notes,3000);if(!data.name)throw new HttpError(400,'Enter a project name.');
  if(!old)data.sites=[{id:crypto.randomUUID(),name:'General',weight:1,location:'',coordinates:'',source:'',stages:[]}];
 }else{
  if(!['todo','doing','done','waiting','uncertain'].includes(b.status))throw new HttpError(400,'Invalid status.');
  data.status=b.status;
  if(b.operation==='status'&&!old)throw new HttpError(404,'Task not found.');
  if(b.operation==='task'){
   data.title=clean(b.title,300);if(!data.title)throw new HttpError(400,'Enter a task name.');
   if(!['urgent','high','normal','low'].includes(b.priority))throw new HttpError(400,'Choose a priority.');
   if(typeof b.startDate!=='string'||typeof b.endDate!=='string'||!validDate(b.startDate)||!validDate(b.endDate)||(b.startDate&&b.endDate&&b.startDate>b.endDate))throw new HttpError(400,'Check the start and end dates.');
   const projectId=clean(b.projectId,100),parentId=clean(b.parentId,100);
   if(projectId&&!await db.prepare('SELECT id FROM progress_projects WHERE id=?').bind(projectId).first())throw new HttpError(400,'Project no longer exists.');
   const all=(await db.prepare('SELECT task_id,parent_id FROM pm_task_details').all()).results,parents=new Map(all.map(m=>[m.task_id,m.parent_id]));
   if(parentId&&!await db.prepare('SELECT id FROM tasks WHERE id=?').bind(parentId).first())throw new HttpError(400,'Parent task no longer exists.');
   let ancestor=parentId;const visited=new Set([id]);while(ancestor){if(visited.has(ancestor))throw new HttpError(400,'A task cannot be its own ancestor.');visited.add(ancestor);ancestor=parents.get(ancestor)||'';}
   const employees=await people();if(!Array.isArray(b.assigneeIds)||b.assigneeIds.length>30||b.assigneeIds.some(email=>!employees.some(p=>p.email===email)))throw new HttpError(400,'Choose enabled employees.');
   const assignees=[...new Set(b.assigneeIds)],previousMeta=await db.prepare('SELECT * FROM pm_task_details WHERE task_id=?').bind(id).first();
   data.next=clean(b.description,6000);data.priority=b.priority;data.due=b.endDate;
   if(b.replaceOwner||!old)data.owner=assignees.map(email=>employees.find(p=>p.email===email).name).join(' + ');
   if(projectId||previousMeta?.project_id||b.replaceProject||!old)data.projectRef=projectId;
   metadata={projectId,parentId,assignees,startDate:b.startDate};
  }
 }
 const lock=db.prepare('UPDATE pm_state SET revision=revision+1 WHERE id=1 AND revision=?').bind(state.revision);
 const mutation=old?db.prepare(`UPDATE ${table} SET data=?,revision=?,updated=? WHERE id=? AND revision=? AND changes()=1`).bind(JSON.stringify(data),revision,at,id,old.revision):db.prepare(`INSERT INTO ${table}(id,data,revision,updated) SELECT ?,?,?,? WHERE changes()=1`).bind(id,JSON.stringify(data),revision,at);
 const audit=b.operation==='project'?db.prepare('INSERT INTO progress_history(id,project_id,revision,data,at) SELECT ?,?,?,?,? WHERE changes()=1').bind(auditId,id,revision,JSON.stringify(data),at):db.prepare('INSERT INTO events(id,task_id,data,at) SELECT ?,?,?,? WHERE changes()=1').bind(auditId,id,JSON.stringify({before:old?prior:null,after:data,actor:user.email,source:'project-management'}),at);
 const queries=[lock,mutation,audit];
 if(metadata)queries.push(db.prepare('INSERT INTO pm_task_details(task_id,project_id,parent_id,assignees,start_date) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?) ON CONFLICT(task_id) DO UPDATE SET project_id=excluded.project_id,parent_id=excluded.parent_id,assignees=excluded.assignees,start_date=excluded.start_date').bind(id,metadata.projectId,metadata.parentId,JSON.stringify(metadata.assignees),metadata.startDate,auditId));
 const result=await db.batch(queries);if(!result[1].meta.changes)throw new HttpError(409,'Another employee changed this record. Reload before saving.');
 return Response.json({id,revision});
}
