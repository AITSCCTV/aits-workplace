import {HttpError} from './auth.mjs';
export async function readArchive(request,env){
 if(request.method!=='GET')throw new HttpError(405,'Read-only archive.');
 if(!env.DB_LINE_ARCHIVE)throw new HttpError(503,'LINE archive is not connected.');
 const url=new URL(request.url),customer=url.searchParams.get('customer');
 if(customer&&customer.length>200)throw new HttpError(400,'Invalid conversation.');
 let cursor;try{const value=url.searchParams.get('cursor');if(value){if(value.length>1000)throw Error();cursor=JSON.parse(value);if(typeof cursor.time!=='string'||cursor.time.length>40||typeof cursor.id!=='string'||cursor.id.length>200)throw Error();}}catch{throw new HttpError(400,'Invalid cursor.');}
 const where=[],params=[];
 if(customer){where.push('c.customer_id=?');params.push(customer);}
 if(cursor){where.push('(c.timestamp<=? AND (c.timestamp<? OR c.id<?))');params.push(cursor.time,cursor.time,cursor.id);}
 const sql=`SELECT c.id,c.customer_id,substr(c.message,1,12000) AS message,c.message_type,c.sender,c.timestamp,coalesce(nullif(u.real_name,''),nullif(u.name,''),'LINE') AS customer_name FROM conversations c LEFT JOIN customers u ON u.id=c.customer_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY c.timestamp DESC,c.id DESC LIMIT 51`;
 const {results}=await env.DB_LINE_ARCHIVE.prepare(sql).bind(...params).all();
 const messages=results.slice(0,50),last=messages.at(-1);
 return Response.json({messages,nextCursor:results.length>50?JSON.stringify({time:last.timestamp,id:last.id}):null,asOf:new Date().toISOString(),mode:'live_archive',readOnly:true});
}
