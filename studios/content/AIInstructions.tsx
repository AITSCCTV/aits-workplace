import {useEffect,useState} from 'react';
import {apiClient} from './client';
import './instructions.css';
const path='/api/admin/content-studio/instructions';
const labels={research:['Research instructions','แนวทางการค้นคว้า'],monday:['Monday · Education','วันจันทร์ · ความรู้'],thursday:['Thursday · Marketing','วันพฤหัสบดี · การตลาด'],writing:['Captions, tone and SEO','ข้อความ น้ำเสียง และ SEO']};
export default function AIInstructions({language,onBack}:{language:string;onBack:()=>void}){
 const en=language==='en',say=(a:string,b:string)=>en?a:b;
 const [saved,setSaved]=useState<any>(null),[fields,setFields]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false);
 const dirty=!!fields&&JSON.stringify(fields)!==JSON.stringify(saved?.instructions);
 async function load(){setBusy(true);setError('');try{const data=await apiClient.get(path);setSaved(data);setFields(data.instructions);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 const discard=()=>!dirty||window.confirm(say('Discard unsaved instruction changes?','ละทิ้งการแก้ไขคำสั่งที่ยังไม่ได้บันทึกหรือไม่?'));
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const data=await apiClient.put(path,{revision:saved.revision,instructions:fields});setSaved(data);setFields(data.instructions);setNotice(say('Saved. Future research runs will use this version.','บันทึกแล้ว การค้นคว้ารอบถัดไปจะใช้เวอร์ชันนี้'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="ai-instructions">
  <button type="button" onClick={()=>{if(discard())onBack();}}>{say('← Content library','← คลังคอนเทนต์')}</button>
  <h1>{say('AI Instructions','คำสั่ง AI')}</h1>
  <p>{say('Edit the editorial instructions used by research and draft generation. Saving does not generate or publish a post. Existing drafts and runs already in progress are unchanged.','แก้ไขแนวทางที่ใช้ค้นคว้าและสร้างร่าง การบันทึกจะไม่สร้างหรือเผยแพร่โพสต์ และไม่เปลี่ยนร่างเดิมหรือรอบที่กำลังทำงาน')}</p>
  <aside className="instructions-protected"><strong>{say('Protected rules','กฎที่ป้องกันการแก้ไข')}</strong><p>{say('The official logo, brand styling, contact banner, required output format, factual verification and review-before-publishing remain protected. These fields change topics and writing preferences only.','โลโก้ สีและฟอนต์ แบนเนอร์ติดต่อ รูปแบบข้อมูล การตรวจสอบข้อเท็จจริง และการตรวจทานก่อนเผยแพร่ยังคงได้รับการป้องกัน ช่องด้านล่างเปลี่ยนเฉพาะหัวข้อและแนวทางการเขียน')}</p><p>LINE @AITSCCTV · aitscctv.com · 02-878-2951 ext. 100 · info@AITSCCTV.com</p></aside>
  {error&&<div role="alert" className="instructions-error">{error} <button type="button" disabled={busy} onClick={()=>{if(discard())void load();}}>{say('Reload saved version','โหลดเวอร์ชันที่บันทึกไว้')}</button></div>}
  {notice&&<p role="status">{notice}</p>}
  {!fields?<p role="status">{busy?say('Loading instructions…','กำลังโหลดคำสั่ง…'):say('Instructions are unavailable. Try reloading.','ยังไม่สามารถโหลดคำสั่งได้ กรุณาลองใหม่')}</p>:<>
   <p>{say('Version','เวอร์ชัน')} {saved.revision} {saved.updatedAt&&<>· {new Date(saved.updatedAt).toLocaleString(en?'en-GB':'th-TH',{timeZone:'Asia/Bangkok'})} · {saved.updatedBy}</>}{dirty&&say(' · Unsaved changes',' · ยังไม่ได้บันทึก')}</p>
   <form onSubmit={save}>
    {Object.entries(labels).map(([key,label])=><label key={key} className="instruction-field"><strong>{label[en?0:1]}</strong><textarea required maxLength={6000} rows={key==='writing'?10:7} disabled={busy} value={fields[key]} onChange={e=>{setFields({...fields,[key]:e.target.value});setNotice('');}}/><small>{fields[key].length.toLocaleString()} / 6,000</small></label>)}
    <div className="instruction-actions"><button type="submit" disabled={busy||!dirty}>{busy?say('Saving…','กำลังบันทึก…'):say('Save instructions','บันทึกคำสั่ง')}</button><button type="button" onClick={()=>setPreview(!preview)}>{say('Preview instructions','ดูตัวอย่างคำสั่ง')}</button><button type="button" disabled={busy||!dirty} onClick={()=>{if(discard())setFields(saved.instructions);}}>{say('Discard changes','ยกเลิกการแก้ไข')}</button></div>
   </form>
   {preview&&<section><h2>{say('Editorial preview — not saved','ตัวอย่างแนวทาง — ยังไม่ได้บันทึก')}</h2><pre>{Object.entries(labels).map(([key,label])=>label[en?0:1]+'\n'+fields[key]).join('\n\n')}</pre><p>{say('The workflow combines this with its protected rules and the assigned Monday or Thursday slot.','ระบบจะรวมแนวทางนี้เข้ากับกฎที่ป้องกันไว้ และเลือกรอบวันจันทร์หรือวันพฤหัสบดี')}</p></section>}
   <section><h2>{say('Version history','ประวัติเวอร์ชัน')}</h2><p>{say('Restore loads a previous version into the editor. Click Save instructions to activate it.','การเรียกคืนจะโหลดเวอร์ชันเก่าในช่องแก้ไข กดบันทึกคำสั่งเพื่อนำไปใช้')}</p>{!saved.history?.length&&<p>{say('No saved changes yet.','ยังไม่มีประวัติการแก้ไข')}</p>}{saved.history?.map((v:any)=><div className="instruction-version" key={v.revision}><span>v{v.revision} · {v.updatedAt?new Date(v.updatedAt).toLocaleString(en?'en-GB':'th-TH',{timeZone:'Asia/Bangkok'}):say('Original instructions','คำสั่งเริ่มต้น')} · {v.updatedBy}</span><button type="button" disabled={busy||v.revision===saved.revision} onClick={()=>{if(discard()){setFields(v.instructions);setNotice(say('Previous version loaded. Review and save to activate.','โหลดเวอร์ชันก่อนหน้าแล้ว ตรวจทานและบันทึกเพื่อนำไปใช้'));}}}>{say('Restore','เรียกคืน')}</button></div>)}</section>
  </>}
 </main>;
}
