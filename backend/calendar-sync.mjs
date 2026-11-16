import {importPKCS8, SignJWT} from 'jose';

export const calendars=[
 ['R&D_Ethan','c_74d70cac6dd6da11a640f18530eeb17b395b91e9c1aa5c574afc76c9ec2505ed@group.calendar.google.com','#9fe1e7'],
 ['Wait','c_bb2b56104758f89c74d21fab7e560280ee8374b912ecdec8f07c9f3d14bf9232@group.calendar.google.com','#cabdbf'],
 ['P_Nut_Fore','c_1a8246d2568ed5ef458a2edf3d97e99080c1a826d1c1f2aa588b1f1bdbd9a2c4@group.calendar.google.com','#b99aff'],
 ['Craftsman','c_107057bb3894af8d3ee70676e9b6b4821c8034851846fb722e3f7af2a85f55a9@group.calendar.google.com','#7bd148'],
 ['P_Moo_IT','c_9c6285fa80f4c6dab0073795c7943dbd05b23c810314b8cec160a5264f85a276@group.calendar.google.com','#fbe983'],
 ['Avarune','info@aitscctv.com','#ffad46'],
 ['วันหยุด','c_34d16566742a953f66488e1ea18eab7ca7f673096b20f5f04bacfd934933244b@group.calendar.google.com','#d06b64'],
 ['P_Soup_Sale','c_bed6eeb2301b5ad2f18bba6dead66085f9bfc2fc6aeb9337f23f0f2284ba88e8@group.calendar.google.com','#cd74e6'],
];
export async function googleToken(secret,fetcher=fetch){
 const key=JSON.parse(secret);
 if(key.type!=='service_account'||key.client_email!=='aits-workspace-sync@gmail-api-507406.iam.gserviceaccount.com')throw Error('credential_mismatch');
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/calendar.events.readonly'})
  .setProtectedHeader({alg:'RS256',kid:key.private_key_id}).setIssuer(key.client_email)
  .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m')
  .sign(await importPKCS8(key.private_key,'RS256'));
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('google_authorization_failed');const result=await r.json();if(!result.access_token)throw Error('google_authorization_failed');return result.access_token;
}
export async function fetchCalendarSnapshot(token,now=new Date(),fetcher=fetch){
 const day=86400000, from=new Date(now.getTime()-30*day).toISOString(),to=new Date(now.getTime()+180*day).toISOString(),events=[];
 // Sequential requests, at most 3 pages per calendar. Never publish a truncated calendar.
 for(const [name,id,color] of calendars){let pageToken;
  for(let page=0;page<3;page++){
   const url=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(id)+'/events');
   url.search=new URLSearchParams({timeMin:from,timeMax:to,singleEvents:'true',orderBy:'startTime',maxResults:'500',timeZone:'Asia/Bangkok',fields:'items(id,status,summary,start,end,htmlLink,transparency),nextPageToken',...(pageToken?{pageToken}:{})}).toString();
   const r=await fetcher(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('calendar_read_failed');const data=await r.json();
   if(!Array.isArray(data.items))throw Error('invalid_calendar_response');
   for(const e of data.items){if(e.status==='cancelled')continue;const start=e.start?.dateTime||e.start?.date,end=e.end?.dateTime||e.end?.date;if(!e.id||!start||!end)throw Error('invalid_event');events.push({id:id+':'+e.id,title:e.summary||'(ไม่มีชื่อ / Untitled)',start,end,source:e.htmlLink||'',calendar:name,color,transparent:e.transparency==='transparent',participants:[]});}
   pageToken=data.nextPageToken;if(!pageToken)break;
  }
  if(pageToken)throw Error('calendar_page_limit');
 }
 const snapshot={asOf:now.toISOString(),from:from.slice(0,10),to:to.slice(0,10),calendars:8,events,mode:'automatic',intervalMinutes:15};
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>1800000)throw Error('calendar_size_limit');return snapshot;
}
export async function syncCalendars(env,options={}){
 if(!env.GOOGLE_SERVICE_ACCOUNT_JSON)return {status:'not_configured'};
 const now=options.now||new Date(),db=env.DB_PROJECT_BOARD;
 // One lease per 15-minute UTC slot also prevents duplicate scheduled deliveries and manual storms.
 const slot=Math.floor(now.getTime()/900000);
 const claim=await db.prepare("UPDATE sync_status SET slot=?,status='running',attempted_at=? WHERE id='calendar' AND slot<?").bind(slot,now.toISOString(),slot).run();
 if(!claim.meta.changes)return {status:'already_attempted'};
 try{
  const token=await (options.tokenProvider||googleToken)(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const snapshot=await fetchCalendarSnapshot(token,now,options.fetcher||fetch);
  await db.batch([db.prepare('INSERT INTO calendar_snapshot(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(JSON.stringify(snapshot)),db.prepare("UPDATE sync_status SET status='ok',success_at=?,error_code=NULL WHERE id='calendar'").bind(now.toISOString())]);
  return {status:'ok',events:snapshot.events.length,calendars:8};
 }catch(error){
  const known=new Set(['credential_mismatch','google_authorization_failed','calendar_read_failed','invalid_calendar_response','invalid_event','calendar_page_limit','calendar_size_limit']);
  const code=known.has(error.message)?error.message:'sync_failed';
  await db.prepare("UPDATE sync_status SET status='error',error_code=? WHERE id='calendar'").bind(code).run();return {status:'error',code};
 }
}
