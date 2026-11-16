import {HttpError} from './auth.mjs';
export const toolsCatalog=[
 ['tasks','บอร์ดงาน','Task board',[]],['projects','โครงการ','Projects',[]],
 ['calendar','ปฏิทิน','Calendar',[]],['line','บทสนทนา LINE','LINE archive',[]],
 ['review','ตรวจและอนุมัติข้อเสนอ LINE','Review and apply LINE suggestions',['tasks','projects','line']],
 ['design-studio','สตูดิโอออกแบบ','Design Studio',[]],
 ['floorplan-studio','สตูดิโอแปลน','Floorplan Studio',[]],
 ['content-studio','สตูดิโอคอนเทนต์','Content Studio',[]],
 ['inventory','คลังอุปกรณ์','Inventory',[]],['service','บริการและประกัน','Service & warranty',[]],
 ['forms','รับความต้องการและสำรวจหน้างาน','Customer brief & site survey',[]]
].map(([id,th,en,requires])=>({id,th,en,requires}));
export const ownerEmails=env=>(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
export const hasTool=(user,tool)=>user.admin||user.tools?.includes(tool);
export function sessionInfo(user){return {email:user.email,admin:user.admin,tools:user.admin?toolsCatalog.map(t=>t.id):user.tools||[]};}
const decode=row=>({...row,tools:JSON.parse(row.tools),enabled:!!row.enabled});
export async function membersApi(request,env,user){
 if(!user.admin||!user.token)throw new HttpError(403,'Only the workspace owner can manage employee access.');
 const db=env.DB_PROJECT_BOARD;
 if(request.method==='GET')return Response.json({loginReady:env.EMPLOYEE_LOGIN_READY==='true',owners:ownerEmails(env),catalog:toolsCatalog,members:(await db.prepare('SELECT * FROM workspace_members ORDER BY email LIMIT 501').all()).results.map(decode)});
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
 let b;try{b=await request.json()}catch{throw new HttpError(400,'Invalid JSON.');}
 const email=typeof b?.email==='string'?b.email.trim().toLowerCase():'';
 if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid employee email.');
 if(ownerEmails(env).includes(email))throw new HttpError(403,'Owner access cannot be changed here.');
 if(typeof b.enabled!=='boolean'||!Number.isInteger(b.revision)||b.revision<0||!Array.isArray(b.tools)||b.tools.length>toolsCatalog.length||b.tools.some(t=>!toolsCatalog.some(c=>c.id===t)))throw new HttpError(400,'Invalid permissions.');
 const selected=[...new Set(b.tools)].sort();
 if(toolsCatalog.some(t=>selected.includes(t.id)&&t.requires.some(id=>!selected.includes(id))))throw new HttpError(400,'LINE review also requires Task board, Projects and LINE archive.');
 const before=await db.prepare('SELECT * FROM workspace_members WHERE email=?').bind(email).first();
 if((before?.revision||0)!==b.revision)throw new HttpError(409,'Access changed. Reload and review before saving.');
 if(!before&&(await db.prepare('SELECT count(*) AS n FROM workspace_members').first()).n>=500)throw new HttpError(400,'Employee limit reached.');
 const at=new Date().toISOString(),tools=JSON.stringify(selected),next={email,tools:selected,enabled:b.enabled,revision:b.revision+1};
 const mutation=before?db.prepare('UPDATE workspace_members SET tools=?,enabled=?,revision=revision+1,updated_at=?,updated_by=? WHERE email=? AND revision=?').bind(tools,+b.enabled,at,user.email,email,b.revision):db.prepare('INSERT OR IGNORE INTO workspace_members(email,tools,enabled,revision,updated_at,updated_by) VALUES(?,?,?,1,?,?)').bind(email,tools,+b.enabled,at,user.email);
 const result=await db.batch([mutation,db.prepare('INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),email,user.email,before?JSON.stringify(decode(before)):null,JSON.stringify(next),at)]);
 if(!result[0].meta.changes)throw new HttpError(409,'Access changed. Reload and review before saving.');
 return Response.json({member:next});
}
