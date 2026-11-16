const MAX_BYTES=7_000_000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validPlan(s){return s&&s.version===1&&typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=100&&Number.isFinite(s.scale)&&s.scale>=1&&s.scale<=500&&(!s.bg||(typeof s.bg==='string'&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.bg)))&&Array.isArray(s.walls)&&s.walls.length<=300&&Array.isArray(s.devices)&&s.devices.length<=100&&s.walls.every(w=>typeof w.id==='string'&&[w.a?.x,w.a?.y,w.b?.x,w.b?.y,w.loss].every(Number.isFinite)&&w.loss>=0&&w.loss<=100)&&s.devices.every(d=>['camera','ap'].includes(d.type)&&typeof d.id==='string'&&typeof d.label==='string'&&[d.x,d.y,d.angle,d.fov,d.range,d.pixels,d.radius,d.p1,d.n].every(Number.isFinite)&&d.fov>0&&d.fov<=170&&d.range>0&&d.range<=100&&d.radius>0&&d.radius<=100&&d.n>=1&&d.n<=6)}
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('invalid');let n=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>MAX_BYTES){await reader.cancel();throw Error('size')}chunks.push(value)}let bytes=new Uint8Array(n),offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(bytes));}
export async function api(request,env){
 const url=new URL(request.url),owner=request.headers.get('oai-authenticated-user-id');
 if(!owner)return json({error:'กรุณาเข้าสู่ระบบบัญชีเจ้าของแบบก่อนใช้ Cloud'},401);
 if(!env.DB||!env.BUCKET)return json({error:'พื้นที่ Cloud ยังไม่พร้อม แบบในเครื่องไม่ถูกเปลี่ยน'},503);
 const path=url.pathname,match=path.match(/^\/api\/plans\/([a-f0-9-]+)$/i),id=match?.[1];
 if(path!=='/api/plans'&&(!id||!uuid.test(id)))return json({error:'ไม่พบรายการ'},404);
 const getRow=async()=>env.DB.prepare('SELECT * FROM design_plans WHERE id = ? AND owner_id = ?').bind(id,owner).first();
 if(request.method==='GET'){
  if(!id){const rows=await env.DB.prepare('SELECT id, name, revision, updated_at, created_at FROM design_plans WHERE owner_id = ? ORDER BY updated_at DESC').bind(owner).all();return json({plans:rows.results});}
  const row=await getRow();if(!row)return json({error:'ไม่พบแบบหรือไม่มีสิทธิ์'},404);
  const object=await env.BUCKET.get(row.object_key);if(!object)return json({error:'ข้อมูลแบบไม่พร้อม กรุณาใช้ JSON สำรองและอย่าบันทึกทับ'},503);
  return json({id:row.id,revision:row.revision,updated_at:row.updated_at,plan:JSON.parse(await object.text())});
 }
 if(!['POST','PUT'].includes(request.method)|| (id?request.method!=='PUT':request.method!=='POST'))return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==url.origin)return json({error:'คำขอต้องมาจากหน้าโปรแกรมนี้'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'ต้องเป็น JSON'},415);
 let input;try{input=await body(request)}catch(e){return json({error:e.message==='size'?'แบบใหญ่เกิน 7 MB กรุณาลดภาพหรือส่งออก JSON':'ข้อมูลไม่ถูกต้อง'},e.message==='size'?413:400)}
 if(!validPlan(input.plan))return json({error:'แบบไม่ถูกต้อง กรุณาตรวจชื่อและข้อมูลแปลน'},400);
 const planId=id||input.id;if(!uuid.test(planId||''))return json({error:'รหัสแบบไม่ถูกต้อง'},400);
 let previous=null;
 if(id){if(!Number.isSafeInteger(input.revision)||input.revision<1)return json({error:'ต้องระบุ revision ที่เปิดมา'},400);previous=await getRow();if(!previous)return json({error:'ไม่พบแบบหรือไม่มีสิทธิ์'},404);if(previous.revision!==input.revision)return json({error:'มีการแก้ไขจากอีกเครื่องแล้ว แบบของคุณยังอยู่ กรุณาบันทึกเป็นสำเนาหรือเปิดฉบับล่าสุด',conflict:true,revision:previous.revision},409);}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=`plans/${hash}/${planId}/${crypto.randomUUID()}.json`,now=new Date().toISOString();
 await env.BUCKET.put(key,JSON.stringify(input.plan),{httpMetadata:{contentType:'application/json'}});
 let result;
 try{result=id?await env.DB.prepare('UPDATE design_plans SET name = ?, revision = revision + 1, object_key = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?').bind(input.plan.name,key,now,id,owner,input.revision).run():await env.DB.prepare('INSERT INTO design_plans (id, owner_id, name, revision, object_key, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(planId,owner,input.plan.name,key,now,now).run();}catch(e){await env.BUCKET.delete(key);throw e;}
 if(result.meta?.changes!==1){await env.BUCKET.delete(key);return json({error:'แบบมีฉบับใหม่หรือรหัสซ้ำ ไม่บันทึกทับ กรุณาเปิดรายการอีกครั้งหรือบันทึกสำเนา',conflict:true},409);}
 return json({id:planId,revision:id?input.revision+1:1,updated_at:now},id?200:201);
}
