import {HttpError} from './auth.mjs';

export function suggestMessage(row){
 if(!['user','staff','admin'].includes(row.sender)||row.message_type!=='text'||typeof row.message!=='string')return null;
 const message=row.message.trim();
 if(message.length<12||!/(ติดตั้ง|ใบเสนอราคา|สำรวจ|นัด|ซ่อม|ตรวจสอบ|จัดส่ง|อุปกรณ์|กำหนด|เสร็จ|เลื่อน|ยกเลิก|follow.?up|install|quotation|quote|repair|schedule|deliver|complete|cancel)/i.test(message))return null;
 // Capture evidence, not a claim that the event or completion actually happened.
 return {title:message.split('\n')[0].slice(0,220),customer:row.customer_name||'',next:message.slice(0,6000),status:'uncertain',method:'keyword_review',requiresReview:true};
}

export async function scanLine(env,now=new Date()){
 if(!env.DB_LINE_ARCHIVE)return {status:'not_configured'};
 const db=env.DB_PROJECT_BOARD,slot=Math.floor(now.getTime()/900000);
 let scan=await db.prepare('SELECT * FROM line_review_scan WHERE id=1').first();
 if(!scan){const max=await env.DB_LINE_ARCHIVE.prepare('SELECT max(rowid) AS n FROM conversations').first();await db.prepare('INSERT OR IGNORE INTO line_review_scan(id,cursor) VALUES(1,?)').bind(Math.max(0,(max?.n||0)-100)).run();}
 const lease=await db.prepare("UPDATE line_review_scan SET slot=?,status='running',last_at=? WHERE id=1 AND slot<?").bind(slot,now.toISOString(),slot).run();
 if(!lease.meta.changes)return {status:'already_attempted'};
 try{
  const pending=await db.prepare("SELECT count(*) AS n FROM line_review WHERE state='pending'").first();
  const total=await db.prepare('SELECT count(*) AS n FROM line_review').first();
  if(total.n>=10000){await db.prepare("UPDATE line_review_scan SET status='history_full' WHERE id=1").run();return {status:'history_full'};}
  if(pending.n>=2000){await db.prepare("UPDATE line_review_scan SET status='queue_full' WHERE id=1").run();return {status:'queue_full'};}
  scan=await db.prepare('SELECT cursor FROM line_review_scan WHERE id=1').first();
  const {results}=await env.DB_LINE_ARCHIVE.prepare("SELECT c.rowid AS archive_row,c.id,c.customer_id,substr(c.message,1,6000) AS message,c.message_type,c.sender,c.timestamp,coalesce(nullif(u.real_name,''),nullif(u.name,''),'LINE') AS customer_name FROM conversations c LEFT JOIN customers u ON u.id=c.customer_id WHERE c.rowid>? ORDER BY c.rowid LIMIT 100").bind(scan.cursor).all();
  let count=0,cursor=scan.cursor;const statements=[];
  for(const row of results){const proposal=suggestMessage(row);cursor=row.archive_row;if(proposal){statements.push(db.prepare('INSERT OR IGNORE INTO line_review(id,source,proposal,created_at) VALUES(?,?,?,?)').bind(row.id,JSON.stringify(row),JSON.stringify(proposal),now.toISOString()));count++;}if(count>=Math.min(30,2000-pending.n,10000-total.n))break;}
  statements.push(db.prepare("UPDATE line_review_scan SET cursor=?,status='ok',created_count=?,last_at=? WHERE id=1").bind(cursor,count,now.toISOString()));await db.batch(statements);return {status:'ok',created:count};
 }catch{await db.prepare("UPDATE line_review_scan SET status='error' WHERE id=1").run();return {status:'error'};}
}

const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new HttpError(400,'Please check the reviewed fields.');return value.trim();};
export async function approveReview(db,input,user,now=new Date()){
 const id=text(input.id,250,true),review=await db.prepare('SELECT * FROM line_review WHERE id=?').bind(id).first();
 if(!review||review.state!=='pending')throw new HttpError(409,'This suggestion has already been reviewed or no longer exists.');
 const source=JSON.parse(review.source),at=now.toISOString(),auditId='line-review:'+id;
 const evidence=`LINE message ${id}\n${source.customer_name} · ${source.sender} · ${source.timestamp}\n${source.message}`;
 let kind=input.kind,targetId,old,data,revision,mutation,audit;
 if(kind==='create_task'||kind==='update_task'){
  targetId=kind==='create_task'?crypto.randomUUID():text(input.targetId,250,true);
  old=kind==='update_task'?await db.prepare('SELECT * FROM tasks WHERE id=?').bind(targetId).first():null;
  if(kind==='update_task'&&(!old||old.revision!==input.revision))throw new HttpError(409,'The task changed. Reload it and review the latest version.');
  data=old?JSON.parse(old.data):{category:'LINE',status:'uncertain',owner:'',due:'',priority:'ปกติ',evidence:''};
  data={...data,title:text(input.title,300,true),customer:text(input.customer,6000),next:text(input.next,6000),status:text(input.status,30)};
  if(!['todo','doing','waiting','uncertain','done'].includes(data.status))throw new HttpError(400,'Invalid status.');
  data.evidence=[data.evidence,evidence].filter(Boolean).join('\n\n');if(data.evidence.length>60000)throw new HttpError(400,'Task evidence is full. Use a separate task.');
  if(!old)data.source='https://aitscctv.github.io/aits-workplace/project-board/line/?customer='+encodeURIComponent(source.customer_id);
  revision=(old?.revision||0)+1;
  mutation=old?db.prepare("UPDATE tasks SET data=?,revision=?,updated=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM line_review WHERE id=? AND state='pending')").bind(JSON.stringify(data),revision,at,targetId,old.revision,id):db.prepare("INSERT INTO tasks(id,data,revision,updated) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM line_review WHERE id=? AND state='pending')").bind(targetId,JSON.stringify(data),revision,at,id);
  audit=db.prepare('INSERT INTO events(id,task_id,data,at) SELECT ?,?,?,? WHERE changes()=1').bind(auditId,targetId,JSON.stringify({before:old?JSON.parse(old.data):null,after:data,sourceMessage:id,approvedBy:user.email}),at);
 }else if(kind==='project_note'){
  targetId=text(input.targetId,80,true);old=await db.prepare('SELECT * FROM progress_projects WHERE id=?').bind(targetId).first();
  if(!old||old.revision!==input.revision)throw new HttpError(409,'The project changed. Reload it and review the latest version.');
  data=JSON.parse(old.data);const note=text(input.note,2000,true);
  data.notes=[data.notes,`[LINE · ${source.timestamp} · ${source.customer_name}] ${note}\nSource message: ${id}`].filter(Boolean).join('\n\n');
  if(data.notes.length>3000)throw new HttpError(400,'Project notes are full. Shorten the note or create a task.');
  revision=old.revision+1;
  mutation=db.prepare("UPDATE progress_projects SET data=?,revision=?,updated=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM line_review WHERE id=? AND state='pending')").bind(JSON.stringify(data),revision,at,targetId,old.revision,id);
  audit=db.prepare('INSERT INTO progress_history(id,project_id,revision,data,at) SELECT ?,?,?,?,? WHERE changes()=1').bind(auditId,targetId,revision,JSON.stringify(data),at);
 }else throw new HttpError(400,'Choose a supported update.');
 const auditTable=kind==='project_note'?'progress_history':'events';
 const result=await db.batch([mutation,audit,db.prepare(`UPDATE line_review SET state='applied',reviewed_at=?,reviewed_by=?,target_kind=?,target_id=?,applied_data=? WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM ${auditTable} WHERE id=?)`).bind(at,user.email,kind,targetId,JSON.stringify(data),id,auditId)]);
 if(result[0].meta.changes!==1||result[2].meta.changes!==1)throw new HttpError(409,'The record changed. Reload and review before applying.');
 return {state:'applied',targetId,kind,revision};
}

export async function reviewApi(request,env,user){
 const db=env.DB_PROJECT_BOARD,url=new URL(request.url);
 if(request.method==='GET'){
  const state=url.searchParams.get('state')||'pending';if(!['pending','applied','dismissed'].includes(state))throw new HttpError(400,'Invalid review state.');
  const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)throw new HttpError(400,'Invalid page.');
  const rows=await db.prepare('SELECT * FROM line_review WHERE state=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?').bind(state,offset).all();
  const counts=await db.prepare('SELECT state,count(*) AS n FROM line_review GROUP BY state').all();
  return Response.json({items:rows.results.slice(0,50).map(r=>({...r,source:JSON.parse(r.source),proposal:JSON.parse(r.proposal),applied_data:r.applied_data?JSON.parse(r.applied_data):null})),hasMore:rows.results.length>50,counts:counts.results,scan:await db.prepare('SELECT status,last_at,created_count FROM line_review_scan WHERE id=1').first()});
 }
 if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
 const input=await request.json();
 if(input.action==='scan')return Response.json(await scanLine(env));
 if(input.action==='dismiss'){
  const result=await db.prepare("UPDATE line_review SET state='dismissed',reviewed_at=?,reviewed_by=? WHERE id=? AND state='pending'").bind(new Date().toISOString(),user.email,text(input.id,250,true)).run();
  if(!result.meta.changes)throw new HttpError(409,'This suggestion has already been reviewed.');return Response.json({state:'dismissed'});
 }
 if(input.action==='approve')return Response.json(await approveReview(db,input,user));
 throw new HttpError(400,'Invalid review action.');
}
