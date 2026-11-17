import {isPrivilegedRole} from './roles.mjs';
import {scryptSync,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
import {HttpError} from './auth.mjs';
import {ownerEmails} from './members.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const derive=(password,salt)=>{try{return scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex')}catch(e){throw new HttpError(503,'Password hashing unavailable: '+(e.code||e.name||'runtime_error'));}};
const now=()=>Math.floor(Date.now()/1000);
export function validatePassword(password){
 if(typeof password!=='string'||password.length<8||password.length>30||!password.trim()||/^(.)\1+$/.test(password)||['passwordpassword','123456789012345','abcdefghijklmnop'].includes(password.toLowerCase()))throw new HttpError(400,'Use a unique password of 8–30 characters.');
}
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');try{return await request.json()}catch{throw new HttpError(400,'Invalid JSON.');}}
async function limit(db,key,max,seconds){
 const time=now(),bucket=Math.floor(time/seconds),id=key+':'+bucket;
 const row=await db.prepare('INSERT INTO workspace_login_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(id,(bucket+2)*seconds).first();
 if(row.count>max)throw new HttpError(429,'Too many sign-in attempts. Please try again later.');
}
export async function passwordIdentity(token,env){
 if(!/^aits_ws_[A-Za-z0-9_-]{43}$/.test(token))throw new HttpError(401,'Sign-in expired or invalid.');
 const tokenHash=digest(token),row=await env.DB_PROJECT_BOARD.prepare('SELECT s.email,p.must_change,p.revision FROM workspace_sessions s JOIN workspace_passwords p ON s.email=p.email WHERE s.token_hash=? AND s.expires>? AND s.password_revision=p.revision').bind(tokenHash,now()).first();
 if(!row)throw new HttpError(401,'Sign-in expired or invalid.');
 return {sub:'workspace:'+row.email,email:row.email,sessionHash:tokenHash,mustChangePassword:!!row.must_change};
}
export async function passwordLogin(request,env){
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 if(env.PASSWORD_LOGIN_ENABLED!=='true')throw new HttpError(503,'Workspace password sign-in is not enabled yet.');
 const db=env.DB_PROJECT_BOARD;
 await limit(db,'global',200,3600);
 await limit(db,'ip:'+digest(request.headers.get('CF-Connecting-IP')||'unknown'),30,900);
 const b=await body(request),email=typeof b?.email==='string'?b.email.trim().toLowerCase():'';
 if(email.length>254||typeof b?.password!=='string'||b.password.length>128)throw new HttpError(401,'Incorrect account or password.');
 await limit(db,'account:'+digest(email),5,900);
 const row=await db.prepare('SELECT p.*,m.enabled FROM workspace_passwords p JOIN workspace_members m ON p.email=m.email WHERE p.email=?').bind(email).first();
 const candidate=derive(b.password,row?.salt||'aits-unknown-account-dummy-salt');
 if(!row||!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(row.hash,'hex'))||!row.enabled||(row.must_change&&row.temporary_expires<now()))throw new HttpError(401,'Incorrect account or password.');
 const token='aits_ws_'+randomBytes(32).toString('base64url');
 const inserted=await db.prepare('INSERT INTO workspace_sessions(token_hash,email,expires,password_revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_passwords p JOIN workspace_members m ON p.email=m.email WHERE p.email=? AND p.revision=? AND p.hash=? AND m.enabled=1)').bind(digest(token),email,now()+(row.must_change?900:28800),row.revision,email,row.revision,row.hash).run();
 if(!inserted.meta.changes)throw new HttpError(401,'Account changed. Please sign in again.');
 return Response.json({token,email,mustChangePassword:!!row.must_change});
}
export async function passwordApi(request,env,user){
 if(request.method!=='POST')throw new HttpError(405,'POST is required.');
 const db=env.DB_PROJECT_BOARD,path=new URL(request.url).pathname;
 if(path==='/auth/logout'){
  if(user.sessionHash)await db.prepare('DELETE FROM workspace_sessions WHERE token_hash=?').bind(user.sessionHash).run();
  return Response.json({ok:true});
 }
 if(path==='/auth/password/change'){
  if(!user.sessionHash)throw new HttpError(403,'Use a workspace password session to change its password.');
  const b=await body(request);validatePassword(b?.password);
  const old=await db.prepare('SELECT * FROM workspace_passwords WHERE email=?').bind(user.email).first();
  if(!old||typeof b.currentPassword!=='string'||b.currentPassword.length>128)throw new HttpError(400,'Enter your current password.');
  await limit(db,'global',200,3600);
  await limit(db,'change:'+digest(user.email),5,900);
  if(!timingSafeEqual(Buffer.from(derive(b.currentPassword,old.salt),'hex'),Buffer.from(old.hash,'hex')))throw new HttpError(401,'Current password is incorrect.');
  if(b.currentPassword===b.password)throw new HttpError(400,'Choose a different password.');
  const salt=randomBytes(24).toString('hex'),hash=derive(b.password,salt),at=new Date().toISOString();
  const result=await db.batch([db.prepare('UPDATE workspace_passwords SET salt=?,hash=?,must_change=0,temporary_expires=NULL,revision=revision+1,updated_at=? WHERE email=? AND revision=?').bind(salt,hash,at,user.email,old.revision),db.prepare('DELETE FROM workspace_sessions WHERE email=?').bind(user.email)]);
  if(!result[0].meta.changes)throw new HttpError(409,'Password changed elsewhere. Sign in again.');
  return Response.json({ok:true,signInAgain:true});
 }
 if(path==='/project-board/api/member-password'){
  if(!user.admin||!user.token)throw new HttpError(403,'Administrator access is required.');
  const b=await body(request),email=typeof b?.email==='string'?b.email.trim().toLowerCase():'';
  const member=await db.prepare('SELECT role,enabled FROM workspace_members WHERE email=?').bind(email).first();
  if(ownerEmails(env).includes(email)||email===user.email||(!user.owner&&isPrivilegedRole(member?.role)))throw new HttpError(403,'This administrator account is protected.');
  if(!member?.enabled)throw new HttpError(400,'Save and enable the employee account first.');
  await limit(db,'global',200,3600);
  await limit(db,'reset:'+digest(user.email),20,3600);
  const password=randomBytes(18).toString('base64url'),salt=randomBytes(24).toString('hex'),hash=derive(password,salt),at=new Date().toISOString();
  const result=await db.batch([
   db.prepare("INSERT INTO workspace_passwords(email,salt,hash,must_change,temporary_expires,revision,updated_at) SELECT ?,?,?,1,?,1,? WHERE EXISTS(SELECT 1 FROM workspace_members WHERE email=? AND enabled=1 AND (role NOT IN ('admin','managing-director') OR ?=1)) ON CONFLICT(email) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,must_change=1,temporary_expires=excluded.temporary_expires,revision=revision+1,updated_at=excluded.updated_at").bind(email,salt,hash,now()+86400,at,email,+!!user.owner),
   db.prepare('DELETE FROM workspace_sessions WHERE email=? AND EXISTS(SELECT 1 FROM workspace_passwords WHERE email=? AND updated_at=?)').bind(email,email,at),
   db.prepare('INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,NULL,?,? WHERE EXISTS(SELECT 1 FROM workspace_passwords WHERE email=? AND updated_at=?)').bind(crypto.randomUUID(),email,user.email,JSON.stringify({action:'reset_temporary_password'}),at,email,at)
  ]);
  if(!result[0].meta.changes)throw new HttpError(409,'Account access changed. Reload before resetting its password.');
  return Response.json({email,temporaryPassword:password,expiresInHours:24});
 }
 throw new HttpError(404,'Not found.');
}
export async function cleanSessions(env){const db=env.DB_PROJECT_BOARD;await db.batch([db.prepare('DELETE FROM workspace_sessions WHERE expires<?').bind(now()),db.prepare('DELETE FROM workspace_login_limits WHERE expires<?').bind(now())]);}
