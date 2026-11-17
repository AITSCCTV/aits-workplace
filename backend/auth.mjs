import {isPrivilegedRole} from './roles.mjs';
import {passwordIdentity} from './passwords.mjs';
import {hasTool} from './members.mjs';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const keysets=new Map();
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export async function authenticate(request,env,keys){
 const bridge=request.headers.get('X-AITS-Sites-Bridge');
 if(bridge){
  const path=new URL(request.url).pathname;
  const allowed=new Set(['/project-board/api/tasks','/project-board/api/projects','/project-board/api/warranties','/project-board/api/service','/project-board/api/forms','/project-board/api/calendar','/project-board/mcp']);
  if(request.headers.has('Origin')||!allowed.has(path)||!env.SITES_BRIDGE_TOKEN||! /^[a-f0-9]{64}$/.test(bridge))throw new HttpError(403,'Invalid Site bridge request.');
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(bridge),digest(env.SITES_BRIDGE_TOKEN)]);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  if(mismatch)throw new HttpError(403,'Invalid Site bridge request.');
  if(!(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes('info@aitscctv.com'))throw new HttpError(403,'Site bridge owner is not authorized.');
  return {id:'aits-project-board-site',email:'info@aitscctv.com',admin:true,token:null};
 }
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN||'')||!env.POLICY_AUD)throw new HttpError(503,'Sign-in is not configured yet.');
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]||request.headers.get('cf-access-jwt-assertion');
 if(!token)throw new HttpError(401,'Please sign in to AITS.');
 let payload;
 if(token.startsWith('aits_ws_')){payload=await passwordIdentity(token,env);}else try{
  if(!keys){if(!keysets.has(env.TEAM_DOMAIN))keysets.set(env.TEAM_DOMAIN,createRemoteJWKSet(new URL(env.TEAM_DOMAIN+'/cdn-cgi/access/certs')));keys=keysets.get(env.TEAM_DOMAIN);}
  ({payload}=await jwtVerify(token,keys,{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],clockTolerance:5}));
 }catch{throw new HttpError(401,'Sign-in expired or invalid. Please sign in again.');}
 if(typeof payload.sub!=='string'||typeof payload.email!=='string')throw new HttpError(401,'Invalid user identity.');
 const email=payload.email.toLowerCase();
 const admins=(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 const team=(env.TEAM_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 const owner=admins.includes(email);
 const member=owner?null:await env.DB_PROJECT_BOARD.prepare('SELECT tools,enabled,role,removed_at,revoked_before FROM workspace_members WHERE email=?').bind(email).first();
 if(member?.removed_at)throw new HttpError(403,'This account has been removed from AITS.');
 if(member?.revoked_before&&!payload.sessionHash&&payload.iat<=member.revoked_before)throw new HttpError(401,'Sign-in expired. Please sign in again.');
 if(!owner&&!(member?member.enabled:team.includes(email)))throw new HttpError(403,'This account is not authorized for AITS.');
 const admin=owner||isPrivilegedRole(member?.role);
 return {id:owner?payload.sub:'workspace:'+email,email,admin,owner,role:owner?'owner':member?.role||'custom',token,tools:admin?[]:member?JSON.parse(member.tools):['forms'],sessionHash:payload.sessionHash,mustChangePassword:!!payload.mustChangePassword};
}
export function authorize(user,app,path,method){
 if(user.admin)return;
 const required=app==='inventory'?(path==='/api/stock'?'inventory':null):app==='design-studio'?(/^\/api\/plans(?:\/[^/]+)?$/.test(path)?'design-studio':null):{'/api/assistant':'assistant','/api/tasks':'tasks','/api/projects':'projects','/api/calendar':'calendar','/api/line':'line','/api/line/chat':'line','/api/review':'review','/api/warranties':'service','/api/service':'service','/api/forms':'forms'}[path];
 if(required&&hasTool(user,required)&&(required!=='forms'||method==='POST'))return;
 if(app==='project-board'&&path==='/api/sync-status'&&method==='GET'&&(hasTool(user,'calendar')||hasTool(user,'line')))return;
 throw new HttpError(403,'This tool is not enabled for your account.');
}
