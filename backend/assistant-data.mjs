import {hasTool} from './members.mjs';
import {HttpError} from './auth.mjs';
export const sourcePermissions={tasks:'tasks',projects:'projects',calendar:'calendar',line:'line',customers:'crm',followups:'crm',prices:'prices',quotations:'quotations',inventory:'inventory'};
export const permissionStamp=user=>user.admin?'admin':JSON.stringify([...(user.tools||[])].sort());
export async function companySearch(env,user,args){
 const kind=args.kind,required=sourcePermissions[kind];if(!required||!hasTool(user,required))throw new HttpError(403,'Source not enabled for this account: '+kind);
 const q=String(args.query||'').trim().slice(0,160),customer=String(args.customerId||'').slice(0,200),offset=Number(args.offset)||0;
 if(!Number.isInteger(offset)||offset<0||offset>10000)throw new HttpError(400,'Invalid search page.');
 const db=env.DB_PROJECT_BOARD,crm=env.DB_LINE_ARCHIVE;let rows=[],note='',url='';
 const sql=async(d,s,params=[])=>{const r=await d.prepare(s).bind(...params).all();return r.results};
 const dates=[args.from||'0000-01-01',args.to||'9999-12-31'];
 if(dates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)))throw new HttpError(400,'Use YYYY-MM-DD dates.');
 if(kind==='tasks'||kind==='projects'){
  rows=(await sql(db,`SELECT id,data,revision,updated FROM ${kind==='projects'?'progress_projects':'tasks'} WHERE (?='' OR instr(lower(data),lower(?))>0) ORDER BY updated DESC LIMIT 31 OFFSET ?`,[q,q,offset])).map(r=>({id:r.id,...JSON.parse(r.data),revision:r.revision,updated:r.updated}));url=kind==='tasks'?'project-board/':'project-board/projects/';
 }else if(kind==='line'){
  rows=await sql(crm,`SELECT m.id,m.customer_id,coalesce(nullif(c.real_name,''),c.name,'LINE') AS customer_name,m.sender,substr(m.message,1,3500) AS message,m.message_type,m.timestamp FROM conversations m LEFT JOIN customers c ON c.id=m.customer_id WHERE (?='' OR m.customer_id=?) AND (?='' OR instr(lower(coalesce(m.message,'')||' '||coalesce(c.name,'')||' '||coalesce(c.real_name,'')),lower(?))>0) AND date(m.timestamp)>=? AND date(m.timestamp)<=? ORDER BY m.timestamp DESC,m.id DESC LIMIT 31 OFFSET ?`,[customer,customer,q,q,...dates,offset]);url='project-board/line/';note='Live stored LINE messages; attachment contents are not read. Bot messages are not proof of staff/customer confirmation.';
 }else if(kind==='customers'){
  rows=await sql(crm,`SELECT id,name,real_name,tags,pending_action,updated_at FROM customers WHERE (?='' OR id=?) AND (?='' OR instr(lower(coalesce(name,'')||' '||coalesce(real_name,'')||' '||coalesce(tags,'')),lower(?))>0) ORDER BY updated_at DESC LIMIT 31 OFFSET ?`,[customer,customer,q,q,offset]);url='project-board/line/';
 }else if(kind==='followups'){
  rows=await sql(crm,`SELECT f.id,f.customer_id,c.name,f.title,f.reason,f.status,f.due_at,f.updated_at FROM customer_follow_up_tasks f LEFT JOIN customers c ON c.id=f.customer_id WHERE (?='' OR f.customer_id=?) AND (?='' OR instr(lower(coalesce(f.title,'')||' '||coalesce(c.name,'')),lower(?))>0) ORDER BY f.updated_at DESC LIMIT 31 OFFSET ?`,[customer,customer,q,q,offset]);url='project-board/';
 }else if(kind==='prices'){
  rows=await sql(crm,`SELECT id,product_code,name,main_unit_name,sell_price,sell_price_with_vat,remaining_stock,last_synced_at FROM flowaccount_products WHERE environment='production' AND (?='' OR instr(lower(coalesce(product_code,'')||' '||name),lower(?))>0) ORDER BY name LIMIT 31 OFFSET ?`,[q,q,offset]);note='Production FlowAccount mirror, not a live stock guarantee. Prices may require commercial review; never invent missing prices, costs, or VAT treatment.';
 }else if(kind==='quotations'){
  rows=await sql(crm,`SELECT q.id,q.customer_id,c.name,q.amount,q.status,q.created_at FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE (?='' OR q.customer_id=?) AND (?='' OR instr(lower(coalesce(c.name,'')||' '||q.id),lower(?))>0) ORDER BY q.created_at DESC LIMIT 31 OFFSET ?`,[customer,customer,q,q,offset]);note='Existing CRM quotation summary, not proof of delivery or payment.';
 }else if(kind==='inventory'){
  const row=await dbForInventory(env).prepare('SELECT data,revision FROM trial_state WHERE owner=?').bind(user.id).first();const data=row?JSON.parse(row.data):{items:[],moves:[]};
  rows=data.items.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q.toLowerCase())).slice(offset,offset+31).map(item=>({...item,movements:data.moves.filter(m=>m.item===item.id)}));note='Workspace inventory is an account-scoped trial inventory. Do not describe it as confirmed production stock.';url='inventory/';
 }else if(kind==='calendar'){
  const row=await db.prepare('SELECT data FROM calendar_snapshot WHERE id=1').first();const data=row?JSON.parse(row.data):{events:[]};rows=data.events.filter(e=>(!q||JSON.stringify(e).toLowerCase().includes(q.toLowerCase()))&&e.start.slice(0,10)>=dates[0]&&e.start.slice(0,10)<=dates[1]).slice(offset,offset+31);note='Eight-calendar snapshot, refreshed every 15 minutes. Snapshot timestamp: '+(data.asOf||'unavailable')+'. Availability must be rechecked before booking.';url='project-board/calendar/';
 }
 const more=rows.length>30;rows=rows.slice(0,30);
 if(kind==='quotations'&&offset===0){const drafts=await sql(db,"SELECT id,data,created_at FROM assistant_quotations WHERE actor=? AND (?='' OR customer_id=?) AND (?='' OR instr(lower(data),lower(?))>0) ORDER BY created_at DESC LIMIT 10",[user.email,customer,customer,q,q]);rows.push(...drafts.map(d=>({id:d.id,...JSON.parse(d.data),created_at:d.created_at,source:'Workspace draft, not issued'})));}
 return {kind,note,asOf:new Date().toISOString(),nextOffset:more?offset+30:null,records:rows.map((r,i)=>({...r,sourceId:kind+':'+(r.id||offset+i),sourceUrl:url+(kind==='line'||kind==='customers'?'?customer='+encodeURIComponent(r.customer_id||r.id):'')}))};
}
function dbForInventory(env){return env.DB_INVENTORY;}
