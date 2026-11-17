export async function briefSources(env,period,now){
 const result={line:{status:'unavailable',records:[],limited:false,from:period.from,to:now.toISOString()},calendar:{status:'unavailable',records:[],asOf:null,limited:false}};
 try{
  const rows=(await env.DB_LINE_ARCHIVE.prepare("SELECT m.id,m.customer_id,m.sender,substr(m.message,1,600) AS message,m.message_type,m.timestamp,coalesce(nullif(c.real_name,''),c.name,'LINE') AS customer_name FROM conversations m LEFT JOIN customers c ON c.id=m.customer_id WHERE julianday(m.timestamp)>=julianday(?) AND julianday(m.timestamp)<=julianday(?) ORDER BY julianday(m.timestamp) DESC,m.id DESC LIMIT 121").bind(period.from,now.toISOString()).all()).results;
  result.line={...result.line,status:'available',limited:rows.length>120,records:rows.slice(0,120).map(r=>({...r,sourceId:'line:'+r.id,url:'project-board/line/?customer='+encodeURIComponent(r.customer_id)}))};
 }catch{}
 try{
  const row=await env.DB_PROJECT_BOARD.prepare('SELECT data FROM calendar_snapshot WHERE id=1').first();if(!row)throw Error('missing');const snapshot=JSON.parse(row.data);
  if(!Array.isArray(snapshot.events)||!snapshot.asOf)throw Error('missing');
  const until=new Date(now.getTime()+14*86400000).toISOString(),localToday=period.today;
  const matches=snapshot.events.filter(e=>{const end=e.end||e.start;return String(end).slice(0,10)>=localToday&&Date.parse(e.start)<Date.parse(until)}).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  result.calendar={status:'available',asOf:snapshot.asOf,stale:!Number.isFinite(Date.parse(snapshot.asOf))||now.getTime()-Date.parse(snapshot.asOf)>3600000,calendars:snapshot.calendars,limited:matches.length>120,until,records:matches.slice(0,120).map(e=>({sourceId:'calendar:'+e.id,id:e.id,title:String(e.title||'').slice(0,400),start:e.start,end:e.end,calendar:e.calendar,url:'project-board/calendar/'}))};
 }catch{}
 return result;
}
