import {env} from 'cloudflare:workers';
const statuses=['todo','doing','waiting','done','uncertain'];
export async function listTasks(){const r=await env.DB.prepare('SELECT id,data,revision,updated FROM tasks ORDER BY updated DESC').all(); return r.results.map((r:any)=>({...JSON.parse(r.data),id:r.id,revision:r.revision,updated:r.updated}));}
export async function saveTask(input:any){
 if(!input.title || typeof input.title!=='string' || input.title.length>300)throw Error('กรุณาระบุชื่องาน ไม่เกิน 300 ตัวอักษร');
 if(!statuses.includes(input.status))throw Error('สถานะไม่ถูกต้อง');
 const id=typeof input.id==='string'&&input.id?input.id:crypto.randomUUID();
 const old:any=await env.DB.prepare('SELECT revision,data FROM tasks WHERE id=?').bind(id).first();
 if(old && input.revision!==old.revision)throw Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรชและลองอีกครั้ง');
 const fields=['title','customer','category','status','owner','due','next','evidence','source','priority','quoteStage','quoteSentAt','quoteRef','nextFollowUp','orderEvidence','formType','formStage','projectRef'];const prior=old?JSON.parse(old.data):{};const data:any={};
 for(const k of fields)data[k]=typeof input[k]==='string'?input[k].slice(0,k==='evidence'?60000:6000):(typeof prior[k]==='string'?prior[k]:'');
 if(data.quoteStage&&!['waiting','followup','accepted','declined','uncertain'].includes(data.quoteStage))throw Error('สถานะใบเสนอราคาไม่ถูกต้อง');
 for(const k of ['quoteSentAt','nextFollowUp'])if(data[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(data[k]))throw Error('วันที่ไม่ถูกต้อง');
 if(['accepted','declined'].includes(data.quoteStage)&&!data.orderEvidence.trim())throw Error('กรุณาระบุหลักฐานผลการตัดสินใจ');
 if(data.due&&!/^\d{4}-\d{2}-\d{2}$/.test(data.due))throw Error('วันที่ไม่ถูกต้อง');
 if(data.source&&!/^https:\/\//.test(data.source))throw Error('ลิงก์ต้องเป็น HTTPS');
 const now=new Date().toISOString(), revision=(old?.revision||0)+1;
 const mutation=old?env.DB.prepare('UPDATE tasks SET data=?,revision=?,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(data),revision,now,id,old.revision):env.DB.prepare('INSERT INTO tasks(id,data,revision,updated) VALUES(?,?,?,?)').bind(id,JSON.stringify(data),revision,now);
 const results=await env.DB.batch([mutation,env.DB.prepare('INSERT INTO events(id,task_id,data,at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,JSON.stringify({before:old?JSON.parse(old.data):null,after:data}),now)]);
 if(results[0].meta.changes!==1)throw Error('ข้อมูลเปลี่ยนแปลงระหว่างบันทึก กรุณารีเฟรช');
 return {...data,id,revision,updated:now};
}
