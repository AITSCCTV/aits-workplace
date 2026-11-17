import {rolePresets,isPrivilegedRole} from './roles.mjs';
import {toolsCatalog,ownerEmails} from './members.mjs';
import {HttpError} from './auth.mjs';
export async function configuredRoles(db){
 const rows=(await db.prepare('SELECT * FROM workspace_roles').all()).results;
 return rolePresets.filter(r=>!r.legacy).map(r=>{const row=rows.find(v=>v.id===r.id);return {...r,tools:isPrivilegedRole(r.id)?toolsCatalog.map(t=>t.id):row?JSON.parse(row.tools):r.tools,revision:row?.revision||0,locked:isPrivilegedRole(r.id)};});
}
export async function rolesApi(request,env,user){
 if(!user.admin||!user.token)throw new HttpError(403,'Administrator access is required.');
 const db=env.DB_PROJECT_BOARD,owner=ownerEmails(env).includes(user.email);
 if(request.method==='GET'){
  const counts=(await db.prepare('SELECT role,count(*) AS n FROM workspace_members WHERE removed_at IS NULL GROUP BY role').all()).results;
  return Response.json({owner,catalog:toolsCatalog,roles:(await configuredRoles(db)).map(r=>({...r,members:counts.find(c=>c.role===r.id)?.n||0}))});
 }
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 if(!owner)throw new HttpError(403,'Only the workspace owner can edit role permissions.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
 let b;try{b=await request.json()}catch{throw new HttpError(400,'Invalid JSON.');}
 const preset=rolePresets.find(r=>r.id===b?.id&&!r.legacy);
 if(!preset||isPrivilegedRole(preset.id))throw new HttpError(403,'This role is protected.');
 if(!Number.isInteger(b.revision)||b.revision<1||!Array.isArray(b.tools)||b.tools.length>toolsCatalog.length||b.tools.some(id=>!toolsCatalog.some(t=>t.id===id)))throw new HttpError(400,'Invalid role permissions.');
 const selected=[...new Set(b.tools)].sort();
 if(toolsCatalog.some(t=>selected.includes(t.id)&&t.requires.some(id=>!selected.includes(id))))throw new HttpError(400,'Include the required tools for each selected tool.');
 const before=await db.prepare('SELECT * FROM workspace_roles WHERE id=?').bind(b.id).first();
 if(!before||before.revision!==b.revision)throw new HttpError(409,'Role changed. Reload and review before saving.');
 const id=crypto.randomUUID(),at=new Date().toISOString(),tools=JSON.stringify(selected);
 const result=await db.batch([
  db.prepare('UPDATE workspace_roles SET tools=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(tools,at,user.email,b.id,b.revision),
  db.prepare('INSERT INTO workspace_role_audit(id,role,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(id,b.id,user.email,JSON.stringify(before),JSON.stringify({tools:selected,revision:b.revision+1}),at),
  db.prepare("INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?||':'||email,email,?,json_object('role',role,'tools',json(tools),'revision',revision),json_object('role',role,'tools',json(?),'revision',revision+1,'roleUpdate',?),? FROM workspace_members WHERE role=? AND removed_at IS NULL AND EXISTS(SELECT 1 FROM workspace_role_audit WHERE id=?)").bind(id,user.email,tools,id,at,b.id,id),
  db.prepare('UPDATE workspace_members SET tools=?,revision=revision+1,updated_at=?,updated_by=? WHERE role=? AND removed_at IS NULL AND EXISTS(SELECT 1 FROM workspace_role_audit WHERE id=?)').bind(tools,at,user.email,b.id,id)
 ]);
 if(!result[0].meta.changes)throw new HttpError(409,'Role changed. Reload and review before saving.');
 return Response.json({updated:result[3].meta.changes,role:{id:b.id,tools:selected,revision:b.revision+1}});
}
