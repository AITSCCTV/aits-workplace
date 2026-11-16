import {hasTool} from './members.mjs';
import {HttpError} from './auth.mjs';
export async function studioIdentity(user,env,tool){
 if(!['content','floorplan'].includes(tool))throw new HttpError(404,'Unknown studio.');
 if(!user.token)throw new HttpError(403,'Workspace sign-in is required.');
 if(!hasTool(user,tool+'-studio'))throw new HttpError(403,'This studio is not enabled for your account.');
 const staff=await env.DB_LINE_ARCHIVE.prepare('SELECT id,name,email,role FROM staff WHERE lower(email)=? LIMIT 2').bind(user.email).all();
 if(staff.results.length>1)throw new HttpError(403,'Staff identity needs review.');
 const found=staff.results[0];
 const role=user.admin?'admin':tool==='content'?'marketing':'network_engineer';
 const roles=tool==='content'?['admin','marketing']:['admin','sales','network_engineer'];
 if(!roles.includes(role))throw new HttpError(403,'This account does not have access to this studio.');
 return {authorized:true,tool,user:{id:found?.id||'workspace:'+user.id,email:user.email,name:found?.name||user.email,role,auth_source:'workspace'}};
}
