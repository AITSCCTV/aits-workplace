import {env} from 'cloudflare:workers';
import {validateProject} from './project-progress.mjs';
function db(){if(!env.DB)throw Error('ฐานข้อมูลไม่พร้อม');return env.DB;}
export async function listProjects(){const r=await db().prepare('SELECT * FROM progress_projects ORDER BY updated DESC').all();return r.results.map((x:any)=>({...JSON.parse(x.data),id:x.id,revision:x.revision,updated:x.updated}));}
export async function history(id:string){return (await db().prepare('SELECT revision,at FROM progress_history WHERE project_id=? ORDER BY revision DESC LIMIT 100').bind(id).all()).results}
export async function saveProject(input:any){
 const data=validateProject(input);const id=input.id;
 if(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id))throw Error('รหัสโครงการไม่ถูกต้อง');
 const old:any=await db().prepare('SELECT revision,data FROM progress_projects WHERE id=?').bind(id).first();
 if(old&&input.quote===undefined){data.quote=JSON.parse(old.data).quote||data.quote;}
 if(old&&input.workspace===undefined){const previous=JSON.parse(old.data);data.workspace=previous.workspace||data.workspace;}
 if(old&&old.revision!==input.revision)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก');
 if(!old&&input.revision)throw Error('ไม่พบโครงการเดิม กรุณาโหลดใหม่');
 const rev=(old?.revision||0)+1,at=new Date().toISOString(),json=JSON.stringify(data);
 const write=old?db().prepare('UPDATE progress_projects SET data=?,revision=?,updated=? WHERE id=? AND revision=?').bind(json,rev,at,id,old.revision):db().prepare('INSERT INTO progress_projects(id,data,revision,updated) VALUES(?,?,?,?)').bind(id,json,rev,at);
 // Same D1 transaction; audit inserted only if conditional update changed a row.
 const results=await db().batch([write,db().prepare('INSERT INTO progress_history(id,project_id,revision,data,at) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,rev,json,at)]);
 if(results[0].meta.changes!==1)throw Error('มีคนแก้ข้อมูลระหว่างบันทึก กรุณาโหลดใหม่');return {...data,id,revision:rev,updated:at};
}
