import {rolePresets} from './roles.mjs';
import {HttpError} from './auth.mjs';
export const toolsCatalog=[
 ['assistant','ผู้ช่วย AI','AI assistant',[]],['crm','ข้อมูลลูกค้า AI','AI customer records',[]],['prices','ราคาสินค้า AI','AI price list',[]],['quotations','ใบเสนอราคา AI','AI quotations',[]],['calendar-write','สร้างกิจกรรมผ่าน AI','Create calendar events',['calendar']],
 ['tasks','บอร์ดงาน','Task board',[]],['projects','โครงการ','Projects',[]],
 ['calendar','ปฏิทิน','Calendar',[]],['line','บทสนทนา LINE','LINE conversations',[]],['line-send','ตอบกลับ LINE','Reply to LINE',['line']],
 ['review','ตรวจและอนุมัติข้อเสนอ LINE','Review and apply LINE suggestions',['tasks','projects','line']],
 ['design-studio','สตูดิโอออกแบบ','Design Studio',[]],
 ['floorplan-studio','สตูดิโอแปลน','Floorplan Studio',[]],
 ['content-studio','สตูดิโอคอนเทนต์','Content Studio',[]],
 ['inventory','คลังอุปกรณ์','Inventory',[]],['service','บริการและประกัน','Service & warranty',[]],
 ['forms','รับความต้องการและสำรวจหน้างาน','Customer brief & site survey',[]]
].map(([id,th,en,requires])=>({id,th,en,requires}));
export const ownerEmails=env=>(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
export const hasTool=(user,tool)=>user.admin||user.tools?.includes(tool);
export function sessionInfo(user){return {email:user.email,admin:user.admin,owner:!!user.owner,role:user.role||(user.admin?'owner':'custom'),mustChangePassword:!!user.mustChangePassword,passwordLogin:!!user.sessionHash,tools:user.admin?toolsCatalog.map(t=>t.id):user.tools||[]};}
const decode=row=>({...row,tools:JSON.parse(row.tools),enabled:!!row.enabled});
export async function membersApi(request,env,user){
 if(!user.admin||!user.token)throw new HttpError(403,'Only the workspace owner can manage employee access.');
 const db=env.DB_PROJECT_BOARD,owner=ownerEmails(env).includes(user.email);

 if(request.method==='GET')return Response.json({owner,passwordLoginEnabled:env.PASSWORD_LOGIN_ENABLED==='true',roles:rolePresets.filter(r=>owner||r.id!=='admin'),loginReady:env.EMPLOYEE_LOGIN_READY==='true',owners:ownerEmails(env),catalog:toolsCatalog,members:(await db.prepare('SELECT * FROM workspace_members WHERE removed_at IS NULL ORDER BY email LIMIT 501').all()).results.map(decode)});
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
 let b;try{b=await request.json()}catch{throw new HttpError(400,'Invalid JSON.');}
 const email=typeof b?.email==='string'?b.email.trim().toLowerCase():'';
 if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid employee email.');
 if(ownerEmails(env).includes(email))throw new HttpError(403,'Owner access cannot be changed here.');
 const before=await db.prepare('SELECT * FROM workspace_members WHERE email=?').bind(email).first();
 if(!owner&&(before?.role==='admin'||email===user.email))throw new HttpError(403,'Only the owner can change administrator accounts.');
 if(b.action==='remove'){
  if(!Number.isInteger(b.revision)||!before||before.removed_at||before.revision!==b.revision)throw new HttpError(409,'Access changed. Reload and review before removing.');
  const at=new Date().toISOString(),auditId=crypto.randomUUID();
  const result=await db.batch([
   db.prepare("UPDATE workspace_members SET enabled=0,tools='[]',removed_at=?,revoked_before=?,revision=revision+1,updated_at=?,updated_by=? WHERE email=? AND revision=? AND removed_at IS NULL").bind(at,Math.floor(Date.now()/1000),at,user.email,email,b.revision),
   db.prepare('INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(auditId,email,user.email,JSON.stringify(decode(before)),JSON.stringify({email,removed:true}),at),
   db.prepare('DELETE FROM workspace_passwords WHERE email=? AND EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)').bind(email,auditId),
   db.prepare('DELETE FROM workspace_sessions WHERE email=? AND EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)').bind(email,auditId)
  ]);
  if(!result[0].meta.changes)throw new HttpError(409,'Access changed. Reload and review before removing.');
  return Response.json({removed:true,email});
 }
 if(b.action!==undefined)throw new HttpError(400,'Unknown account action.');
 if(typeof b.enabled!=='boolean'||!Number.isInteger(b.revision)||b.revision<0||!Array.isArray(b.tools)||b.tools.length>toolsCatalog.length||b.tools.some(t=>!toolsCatalog.some(c=>c.id===t)))throw new HttpError(400,'Invalid permissions.');
 const role=b.role||'custom';
 if(!rolePresets.some(r=>r.id===role))throw new HttpError(400,'Unknown role.');
 if(!owner&&role==='admin')throw new HttpError(403,'Only the owner can assign administrators.');
 const selected=role==='admin'?toolsCatalog.map(t=>t.id).sort():[...new Set(b.tools)].sort();
 if(toolsCatalog.some(t=>selected.includes(t.id)&&t.requires.some(id=>!selected.includes(id))))throw new HttpError(400,'LINE review also requires Task board, Projects and LINE archive.');
 if((before&&!before.removed_at?before.revision:0)!==b.revision)throw new HttpError(409,'Access changed. Reload and review before saving.');
 if((!before||before.removed_at)&&(await db.prepare('SELECT count(*) AS n FROM workspace_members WHERE removed_at IS NULL').first()).n>=500)throw new HttpError(400,'Employee limit reached.');
 const revision=before?.revision||0,at=new Date().toISOString(),tools=JSON.stringify(selected),next={email,role,tools:selected,enabled:b.enabled,revision:revision+1};
 const mutation=before?db.prepare('UPDATE workspace_members SET tools=?,enabled=?,role=?,removed_at=NULL,revision=revision+1,updated_at=?,updated_by=? WHERE email=? AND revision=?').bind(tools,+b.enabled,role,at,user.email,email,revision):db.prepare('INSERT OR IGNORE INTO workspace_members(email,tools,enabled,role,revision,updated_at,updated_by) VALUES(?,?,?,?,1,?,?)').bind(email,tools,+b.enabled,role,at,user.email);
 const result=await db.batch([mutation,db.prepare('INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),email,user.email,before?JSON.stringify(decode(before)):null,JSON.stringify(next),at)]);
 if(!result[0].meta.changes)throw new HttpError(409,'Access changed. Reload and review before saving.');
 return Response.json({member:next});
}
