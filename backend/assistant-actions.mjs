import {HttpError} from './auth.mjs';
import {hasTool} from './members.mjs';
import {googleToken} from './calendar-sync.mjs';
const need=(u,p)=>{if(!hasTool(u,p))throw new HttpError(403,'Permission required: '+p)};
const str=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
export function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new HttpError(400,'Use a valid date including the year.');return v;}
const customerName=async(env,id)=>{const c=await env.DB_LINE_ARCHIVE.prepare("SELECT id,coalesce(nullif(real_name,''),name) AS name FROM customers WHERE id=?").bind(id).first();if(!c)throw new HttpError(400,'Choose an existing customer.');return c.name;};
export async function prepareAction(env,user,kind,b){
 if(!b||typeof b!=='object')throw new HttpError(400,'Invalid action.');
 if(kind==='create_task'||kind==='update_task'){
  need(user,'tasks');const title=str(b.title),customer=str(b.customer),due=b.due?validDate(b.due):'';if(!title)throw new HttpError(400,'A task title is required.');
  const status=['todo','doing','waiting','uncertain','done'].includes(b.status)?b.status:'todo';if(status==='done'&&!str(b.evidence,5000))throw new HttpError(400,'Completion needs evidence.');
  let old=null;if(kind==='update_task'){old=await env.DB_PROJECT_BOARD.prepare('SELECT * FROM tasks WHERE id=?').bind(str(b.id)).first();if(!old)throw new HttpError(400,'Task not found.');}
  return {id:old?.id||'',revision:old?.revision||0,title,customer,category:str(b.category)||'Follow up',status,due,next:str(b.next,3000),evidence:str(b.evidence,5000),owner:str(b.owner)};
 }
 if(kind==='project_note'){
  need(user,'projects');const old=await env.DB_PROJECT_BOARD.prepare('SELECT * FROM progress_projects WHERE id=?').bind(str(b.id)).first();if(!old||!str(b.note,1500))throw new HttpError(400,'An existing project and note are required.');return {id:old.id,revision:old.revision,note:str(b.note,1500)};
 }
 if(kind==='create_event'){
  need(user,'calendar');need(user,'calendar-write');const title=str(b.title),start=str(b.start,40),end=str(b.end,40);if(!title)throw new HttpError(400,'Event title required.');
  const allDay=/^\d{4}-\d{2}-\d{2}$/.test(start);if(allDay){validDate(start);validDate(end)}else if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(end))throw new HttpError(400,'Confirm start and end times in Bangkok time.');
  validDate(start.slice(0,10));validDate(end.slice(0,10));
  if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>7*86400000)throw new HttpError(400,'Confirm a valid event duration of at most seven days.');
  return {title,start,end,allDay,calendar:'info@aitscctv.com',visibility:'private',description:str(b.description,3000)};
 }
 if(kind==='create_quote'){
  need(user,'quotations');need(user,'prices');need(user,'crm');const customerId=str(b.customerId,200),customer=await customerName(env,customerId);
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>30)throw new HttpError(400,'Choose 1–30 priced catalogue items.');const items=[];
  for(const i of b.items){const p=await env.DB_LINE_ARCHIVE.prepare("SELECT id,product_code,name,main_unit_name,sell_price,last_synced_at FROM flowaccount_products WHERE id=? AND environment='production'").bind(str(i.productId,200)).first();if(!p||p.sell_price===null||!Number.isFinite(p.sell_price)||p.sell_price<0||!Number.isFinite(i.quantity)||i.quantity<=0||i.quantity>10000)throw new HttpError(400,'Each quotation item needs a saved production price and valid quantity.');const unitCents=Math.round(p.sell_price*100);items.push({productId:p.id,code:p.product_code,name:p.name,unit:p.main_unit_name,quantity:i.quantity,unitCents,totalCents:Math.round(unitCents*i.quantity),priceAsOf:p.last_synced_at});}
  return {customerId,customer,items,subtotalCents:items.reduce((s,i)=>s+i.totalCents,0),currency:'THB',tax:'VAT, installation, discounts and commercial terms require review; not included in subtotal.',notes:str(b.notes,3000),status:'draft'};
 }
 throw new HttpError(400,'Unsupported action. LINE writes are never allowed.');
}
export async function applyAction(env,user,id,fetcher=fetch){
 const db=env.DB_PROJECT_BOARD,row=await db.prepare('SELECT * FROM assistant_actions WHERE id=? AND actor=?').bind(id,user.email).first();if(!row)throw new HttpError(404,'Action not found.');
 const required={create_task:['tasks'],update_task:['tasks'],project_note:['projects'],create_event:['calendar','calendar-write'],create_quote:['quotations','prices','crm']}[row.kind];if(!required)throw new HttpError(400,'Unsupported action.');for(const p of required)need(user,p);
 if(row.status==='applied')return JSON.parse(row.result);if(row.status==='cancelled')throw new HttpError(409,'Action cancelled.');
 const b=JSON.parse(row.payload),checked=await prepareAction(env,user,row.kind,b);
 if(row.kind==='create_quote'&&JSON.stringify(checked.items)!==JSON.stringify(b.items))throw new HttpError(409,'Catalogue prices changed. Ask for a new draft.');
 const now=new Date().toISOString(),resultId='ai'+row.id.replaceAll('-','');let result;
 if(row.kind==='create_event'){
  if(env.ASSISTANT_CALENDAR_WRITE_ENABLED!=='true')throw new HttpError(503,'Calendar editing is not enabled.');
  const claimed=await db.prepare("UPDATE assistant_actions SET status='applying' WHERE id=? AND actor=? AND status IN ('pending','applying')").bind(id,user.email).run();if(!claimed.meta.changes)throw new HttpError(409,'Action changed. Reload before retrying.');
  const token=await googleToken(env.GOOGLE_SERVICE_ACCOUNT_JSON,fetcher,'https://www.googleapis.com/auth/calendar.events');
  const endpoint='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(b.calendar)+'/events';const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const prior=await fetcher(endpoint+'/'+resultId,{headers});if(prior.ok){const e=await prior.json();if(e.extendedProperties?.private?.aitsAction!==id)throw new HttpError(409,'Event identity conflict.');result={id:e.id,url:e.htmlLink,kind:row.kind};}else{
   if(prior.status!==404)throw new HttpError(503,'Cannot verify prior event. Retry later.');
   const check=await fetcher(endpoint+'?'+new URLSearchParams({timeMin:new Date(b.allDay?b.start+'T00:00:00+07:00':b.start).toISOString(),timeMax:new Date(b.allDay?b.end+'T00:00:00+07:00':b.end).toISOString(),singleEvents:'true',maxResults:'250'}),{headers});if(!check.ok)throw new HttpError(503,'Calendar availability could not be checked.');const busy=await check.json();if(busy.nextPageToken||busy.items?.some(e=>e.status!=='cancelled'&&e.transparency!=='transparent')){await db.prepare("UPDATE assistant_actions SET status='pending' WHERE id=? AND status='applying'").bind(id).run();throw new HttpError(409,'This time overlaps an existing event. Choose another time and create a new proposal.');}
   const event={id:resultId,summary:b.title,description:b.description,start:b.allDay?{date:b.start}:{dateTime:b.start,timeZone:'Asia/Bangkok'},end:b.allDay?{date:b.end}:{dateTime:b.end,timeZone:'Asia/Bangkok'},visibility:'private',extendedProperties:{private:{aitsAction:id}},reminders:{useDefault:false}};
   const r=await fetcher(endpoint+'?sendUpdates=none',{method:'POST',headers,body:JSON.stringify(event)});if(!r.ok)throw new HttpError(r.status===403?403:503,'Event not confirmed. Check calendar permission or retry this same action.');const e=await r.json();result={id:e.id,url:e.htmlLink,kind:row.kind};
  }
  await db.prepare("UPDATE assistant_actions SET status='applied',result=? WHERE id=? AND actor=?").bind(JSON.stringify(result),id,user.email).run();return result;
 }
 const claim=db.prepare("UPDATE assistant_actions SET status='applying' WHERE id=? AND actor=? AND status='pending'").bind(id,user.email);const queries=[claim];
 if(row.kind==='create_task'||row.kind==='update_task'){
  const old=row.kind==='update_task'?await db.prepare('SELECT * FROM tasks WHERE id=?').bind(b.id).first():null;if(old&&old.revision!==b.revision)throw new HttpError(409,'Task changed. Ask for a new proposal.');
  const taskId=old?.id||resultId,data={...(old?JSON.parse(old.data):{priority:'ปกติ',source:''}),...b};delete data.id;delete data.revision;const revision=old?old.revision+1:1;
  queries.push(old?db.prepare("UPDATE tasks SET data=?,revision=?,updated=? WHERE id=? AND revision=? AND changes()=1").bind(JSON.stringify(data),revision,now,taskId,b.revision):db.prepare('INSERT INTO tasks(id,data,revision,updated) SELECT ?,?,?,? WHERE changes()=1').bind(taskId,JSON.stringify(data),revision,now));
  queries.push(db.prepare('INSERT INTO events(id,task_id,data,at) SELECT ?,?,?,? WHERE changes()=1').bind(resultId,taskId,JSON.stringify({actor:user.email,before:old?JSON.parse(old.data):null,after:data,assistantAction:id}),now));result={kind:row.kind,id:taskId,url:'project-board/?task='+encodeURIComponent(taskId)};
 }else if(row.kind==='project_note'){
  const old=await db.prepare('SELECT * FROM progress_projects WHERE id=?').bind(b.id).first();if(old.revision!==b.revision)throw new HttpError(409,'Project changed. Ask for a new proposal.');const data=JSON.parse(old.data);data.notes=(data.notes?data.notes+'\n':'')+b.note;if(data.notes.length>3000)throw new HttpError(400,'Project notes are full.');
  queries.push(db.prepare('UPDATE progress_projects SET data=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND changes()=1').bind(JSON.stringify(data),now,b.id,b.revision));queries.push(db.prepare('INSERT INTO progress_history(id,project_id,revision,data,at) SELECT ?,?,?,?,? WHERE changes()=1').bind(resultId,b.id,b.revision+1,JSON.stringify(data),now));result={kind:row.kind,id:b.id,url:'project-board/projects/?project='+encodeURIComponent(b.id)};
 }else if(row.kind==='create_quote'){
  queries.push(db.prepare('INSERT INTO assistant_quotations(id,actor,customer_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(resultId,user.email,b.customerId,JSON.stringify(b),now));result={kind:row.kind,id:resultId,draft:b};
 }
 queries.push(db.prepare("UPDATE assistant_actions SET status='applied',result=? WHERE id=? AND status='applying' AND changes()=1").bind(JSON.stringify(result),id));const applied=await db.batch(queries);if(applied.at(-1).meta.changes!==1){if(applied[0].meta.changes===1)await db.prepare("UPDATE assistant_actions SET status='pending' WHERE id=? AND status='applying'").bind(id).run();throw new HttpError(409,'Action changed or already processing. Reload before retrying.');}return result;
}
