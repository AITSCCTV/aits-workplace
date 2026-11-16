import {createRemoteJWKSet,jwtVerify} from 'jose';
const keysets=new Map();
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export async function authenticate(request,env,keys){
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN||'')||!env.POLICY_AUD)throw new HttpError(503,'Sign-in is not configured yet.');
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]||request.headers.get('cf-access-jwt-assertion');
 if(!token)throw new HttpError(401,'Please sign in to AITS.');
 let payload;
 try{
  if(!keys){if(!keysets.has(env.TEAM_DOMAIN))keysets.set(env.TEAM_DOMAIN,createRemoteJWKSet(new URL(env.TEAM_DOMAIN+'/cdn-cgi/access/certs')));keys=keysets.get(env.TEAM_DOMAIN);}
  ({payload}=await jwtVerify(token,keys,{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],clockTolerance:5}));
 }catch{throw new HttpError(401,'Sign-in expired or invalid. Please sign in again.');}
 if(typeof payload.sub!=='string'||typeof payload.email!=='string')throw new HttpError(401,'Invalid user identity.');
 const email=payload.email.toLowerCase();
 const admins=(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 const team=(env.TEAM_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!admins.includes(email)&&!team.includes(email))throw new HttpError(403,'This account is not authorized for AITS.');
 return {id:payload.sub,email,admin:admins.includes(email),token};
}
export function authorize(user,app,path,method){
 if(user.admin)return;
 if(app==='project-board'&&path==='/api/forms'&&method==='POST')return;
 throw new HttpError(403,'This account may submit team forms only.');
}
