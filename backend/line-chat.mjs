import {HttpError} from './auth.mjs';
import {hasTool} from './members.mjs';
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200;
export function validateReply(body){
 if(!validId(body?.customerId)||typeof body.message!=='string'||!body.message.trim()||body.message.length>5000||!/^\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId||''))throw new HttpError(400,'Choose a customer and enter a message of 1–5,000 characters.');
 return {id:body.requestId,customerId:body.customerId,message:body.message.trim()};
}
export async function lineChat(request,env,user,fetcher=fetch){
 if(!user.token||!hasTool(user,'line'))throw new HttpError(403,'LINE access is required.');
 const url=new URL(request.url),db=env.DB_LINE_ARCHIVE,local=env.DB_PROJECT_BOARD;
 if(!db)throw new HttpError(503,'LINE connection unavailable.');
 const cap=Number(env.LINE_INCLUDED_MONTHLY_LIMIT)||0;
 if(request.method==='GET'){
  if(url.searchParams.get('view')==='status')return Response.json({mode:'live',pollSeconds:10,canReply:hasTool(user,'line-send'),sendingEnabled:cap>0&&env.LINE_WORKSPACE_SEND_ENABLED==='true',includedLimit:cap,reason:cap?'':'Confirm the LINE plan allowance before enabling replies.'});
  if(url.searchParams.get('view')!=='customers')throw new HttpError(400,'Unknown view.');
  const q=(url.searchParams.get('q')||'').trim().slice(0,120),offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw new HttpError(400,'Invalid page.');
  const {results}=await db.prepare(`SELECT u.id,coalesce(nullif(u.real_name,''),nullif(u.name,''),'LINE') AS name,u.pending_action,
   substr(c.message,1,200) AS message,c.sender,c.timestamp,c.message_type FROM customers u JOIN conversations c ON c.id=(SELECT m.id FROM conversations m WHERE m.customer_id=u.id ORDER BY m.timestamp DESC,m.id DESC LIMIT 1)
   WHERE (?='' OR instr(lower(coalesce(u.real_name,'')||' '||coalesce(u.name,'')||' '||u.id),lower(?))>0)
   ORDER BY c.timestamp DESC,c.id DESC LIMIT 51 OFFSET ?`).bind(q,q,offset).all();
  return Response.json({customers:results.slice(0,50),nextOffset:results.length>50?offset+50:null,asOf:new Date().toISOString()});
 }
 if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
 if(!hasTool(user,'line-send'))throw new HttpError(403,'LINE reply permission is required.');
 const input=validateReply(await request.json());
 if(cap<=0||env.LINE_WORKSPACE_SEND_ENABLED!=='true')throw new HttpError(409,'Replies are prepared but disabled until the included LINE allowance is verified.');
 const customer=await db.prepare('SELECT id,line_user_id FROM customers WHERE id=?').bind(input.customerId).first();
 if(!customer||!/^U[a-f0-9]{32}$/i.test(customer.line_user_id||''))throw new HttpError(400,'This customer does not have a valid LINE recipient.');
 const existing=await local.prepare('SELECT * FROM workspace_line_outbox WHERE id=?').bind(input.id).first();
 if(existing&&(existing.actor!==user.email||existing.customer_id!==input.customerId||existing.message!==input.message))throw new HttpError(409,'This send identifier belongs to a different message.');
 if(existing?.status==='sent')return Response.json({success:true,id:input.id,duplicate:true});
 if(existing&&Date.now()-Date.parse(existing.created_at)>23*60*60*1000)throw new HttpError(409,'This unconfirmed delivery is too old to retry safely. Check LINE before sending again.');
 const row=await db.prepare("SELECT value FROM line_settings WHERE key='channelAccessToken'").first();
 const token=row?.value||env.LINE_CHANNEL_ACCESS_TOKEN;
 if(!token)throw new HttpError(503,'The LINE channel credential is not connected.');
 const provider=async(path,options={})=>fetcher('https://api.line.me/v2/bot/'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
 const [quotaResponse,usageResponse]=await Promise.all([provider('message/quota'),provider('message/quota/consumption')]);
 if(!quotaResponse.ok||!usageResponse.ok)throw new HttpError(503,'Cannot verify LINE allowance. Sending is blocked.');
 const quota=await quotaResponse.json(),usage=await usageResponse.json();
 if(quota.type!=='limited'||!Number.isFinite(quota.value)||!Number.isFinite(usage.totalUsage)||usage.totalUsage>=Math.min(cap,quota.value)-20)throw new HttpError(429,'LINE allowance is low or unavailable. Sending is paused to avoid extra charges.');
 const now=new Date().toISOString(),month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
 if(!existing){
  const reserved=await local.prepare(`INSERT INTO workspace_line_outbox(id,actor,customer_id,message,month,created_at)
   SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM workspace_line_outbox WHERE month=?)<?`).bind(input.id,user.email,input.customerId,input.message,month,now,month,Math.min(cap,1000)).run();
  if(!reserved.meta?.changes)throw new HttpError(429,'Workspace monthly reply limit reached.');
 }
 // LINE retry keys make a lost response safe to retry with the same message ID.
 let response;try{response=await provider('message/push',{method:'POST',headers:{'X-Line-Retry-Key':input.id},body:JSON.stringify({to:customer.line_user_id,messages:[{type:'text',text:input.message}]})});}catch{throw new HttpError(503,'Delivery is unconfirmed. Retry this same message; do not create another copy.');}
 const duplicate=response.status===409&&response.headers.has('x-line-accepted-request-id');
 if(!response.ok&&!duplicate)throw new HttpError(502,'LINE did not accept this message. Retry the same message or check LINE account availability.');
 const result=response.ok?await response.json():{},providerId=result.sentMessages?.[0]?.id||response.headers.get('x-line-accepted-request-id')||'';
 const metadata=JSON.stringify({staffName:user.email,staffId:user.id,deliverySucceeded:true,source:'workspace',lineMessageId:providerId});
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO conversations(id,customer_id,message,sender,message_type,metadata,emotion,intent,timestamp) VALUES(?,?,?,'staff','text',?,'neutral','manual_reply',?)").bind('workspace:'+input.id,input.customerId,input.message,metadata,now),
  db.prepare("UPDATE customers SET pending_action=0 WHERE id=? AND NOT EXISTS(SELECT 1 FROM conversations WHERE customer_id=? AND sender NOT IN ('staff','admin','bot','ai','system') AND datetime(timestamp)>datetime(?))").bind(input.customerId,input.customerId,existing?.created_at||now)
 ]);
 await local.prepare("UPDATE workspace_line_outbox SET status='sent',provider_id=?,sent_at=? WHERE id=?").bind(providerId,now,input.id).run();
 return Response.json({success:true,id:input.id});
}
