import {useEffect,useRef,useState} from 'react';
import {apiClient} from './client';
import './ideas.css';
type Job={id:string;stage:string;reason?:string;draftIds?:string[]};
const storageKey='aits-content-idea-request';
const terminal=['COMPLETE','EMPTY','FAILED','TIMED_OUT'];
export default function IdeaGenerator({language,disabled,onReady}:{language:string;disabled:boolean;onReady:(id?:string)=>void}){
 const en=language==='en';
 const [prompt,setPrompt]=useState(''),[style,setStyle]=useState('MARKETING'),[job,setJob]=useState<Job|null>(null),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 const key=useRef(''),ready=useRef(onReady);ready.current=onReady;
 const active=submitting||!!job&&!terminal.includes(job.stage);
 useEffect(()=>{try{const raw=sessionStorage.getItem(storageKey);if(!raw)return;const saved=raw.startsWith('{')?JSON.parse(raw):{id:raw};if(!/^manual_idea_[a-f0-9]{32}$/.test(saved.id||''))return;if(typeof saved.prompt==='string'&&saved.prompt.length<=4000)setPrompt(saved.prompt);if(['EDUCATIONAL','MARKETING'].includes(saved.style))setStyle(saved.style);setJob({id:saved.id,stage:'QUEUED'});}catch{}},[]);
 useEffect(()=>{
  if(!job?.id||terminal.includes(job.stage))return;
  let stopped=false,timer:number;
  const poll=async()=>{try{
   const result=await apiClient.get('/api/admin/content-studio/research/'+job.id) as Job;
   if(stopped)return;setError('');setJob(result);
   if(terminal.includes(result.stage)){try{sessionStorage.removeItem(storageKey);}catch{}key.current='';return;}
  }catch{if(!stopped)setError(en?'Connection interrupted. Checking again automatically; do not submit the idea again.':'การเชื่อมต่อขัดข้อง กำลังตรวจสอบอีกครั้งโดยอัตโนมัติ ไม่ต้องส่งไอเดียซ้ำ');}
  if(!stopped)timer=window.setTimeout(poll,5000);
  };void poll();return()=>{stopped=true;window.clearTimeout(timer);};
 },[job?.id,job?.stage,en]);
 async function submit(event:React.FormEvent){event.preventDefault();if(active||disabled||prompt.trim().length<10)return;setSubmitting(true);setJob(null);setError('');
  key.current ||= crypto.randomUUID().replaceAll('-','');
  try{const result=await apiClient.post('/api/admin/content-studio/ideas',{prompt,style,requestId:key.current}) as {id:string};setJob({id:result.id,stage:'QUEUED'});try{sessionStorage.setItem(storageKey,JSON.stringify({id:result.id,prompt,style}));}catch{}}
  catch(e){const failure=e as Error&{status?:number};if(failure.status)key.current='';const thai:Record<number,string>={400:'กรุณาใส่ไอเดีย 10–4,000 ตัวอักษรและเลือกรูปแบบเนื้อหา',401:'กรุณาเข้าสู่ระบบอีกครั้ง',403:'บัญชีนี้ไม่มีสิทธิ์ใช้งาน Content Studio',409:'คำขอนี้ถูกใช้แล้ว กรุณาลองส่งไอเดียใหม่',429:'ไอเดียก่อนหน้ายังอยู่ระหว่างดำเนินการ โปรดรอให้เสร็จก่อนส่งไอเดียใหม่',502:'ไม่สามารถเริ่มสร้างร่างได้ กรุณาลองอีกครั้ง',503:'ระบบสร้างร่างยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'};setError(en?failure.message:(thai[failure.status||0]||'การเชื่อมต่อขัดข้อง ลองกดสร้างร่างอีกครั้งเพื่อส่งคำขอเดิมต่อโดยไม่สร้างซ้ำ'));}finally{setSubmitting(false);}
 }
 return <section className="idea-generator" aria-labelledby="idea-title">
  <h1 id="idea-title">{en?'Generate from an idea':'สร้างร่างจากไอเดีย'}</h1>
  <p>{en?'Have a topic in mind? Describe it below. AI will research it and create one draft with captions and a branded image in All Drafts.':'มีหัวข้อในใจใช่ไหม? บอกไอเดียด้านล่าง AI จะค้นคว้าและสร้างร่าง 1 โพสต์ พร้อมข้อความและภาพตามแบรนด์ไว้ในร่างทั้งหมด'}</p>
  <form onSubmit={submit}>
   <label htmlFor="idea-prompt">{en?'Your idea':'ไอเดียของคุณ'}</label>
   <textarea id="idea-prompt" rows={4} minLength={10} maxLength={4000} required value={prompt} disabled={active||disabled} onChange={e=>{setPrompt(e.target.value);key.current='';}} placeholder={en?'Example: Explain how PoE CCTV can help a small shop reduce cabling, and what owners should check before installation.':'เช่น อธิบายว่ากล้อง PoE ช่วยร้านค้าขนาดเล็กลดการเดินสายได้อย่างไร และควรตรวจสอบอะไรบ้างก่อนติดตั้ง'} />
   <div className="idea-options">
    <div><label htmlFor="idea-style">{en?'Content style':'รูปแบบเนื้อหา'}</label><select id="idea-style" value={style} disabled={active||disabled} onChange={e=>{setStyle(e.target.value);key.current='';}}><option value="MARKETING">{en?'Marketing / buying guide':'การตลาด / แนะนำการเลือกซื้อ'}</option><option value="EDUCATIONAL">{en?'Educational / technical':'ความรู้ / เทคนิค'}</option></select><span className="idea-character-count">{prompt.length.toLocaleString()} / 4,000</span></div>
    <div className="idea-submit-area">
     {(active||job?.stage==='COMPLETE')&&<div className={'idea-status-popup'+(active?'':' idea-status-success')} role="status" aria-live="polite" aria-atomic="true">
      {active?<><span className="idea-spinner" aria-hidden="true"/><strong>{en?'Generating your post…':'กำลังสร้างโพสต์…'}</strong><p>{job?.stage==='PREPARING'?(en?'Preparing your branded image and saving your draft.':'กำลังเตรียมภาพตามแบรนด์และบันทึกร่าง'):(en?'Researching your idea and preparing your content. This may take a few minutes.':'กำลังค้นคว้าไอเดียและเตรียมเนื้อหา อาจใช้เวลาสักครู่')}</p></>:<><span className="idea-success-icon" aria-hidden="true">✓</span><strong>{en?'Your post has been generated':'สร้างโพสต์เรียบร้อยแล้ว'}</strong><p>{en?'Your draft is ready in the Content Studio library. Review it there before publishing.':'ร่างของคุณพร้อมแล้วในคลังคอนเทนต์ กรุณาตรวจทานก่อนเผยแพร่'}</p><button type="button" className="outline" onClick={()=>ready.current(job?.draftIds?.[0])}>{en?'View in content library':'ดูในคลังคอนเทนต์'}</button></>}
     </div>}
     <button type="submit" disabled={active||disabled||prompt.trim().length<10}>{active?(en?'Generating…':'กำลังสร้าง…'):(en?'Generate draft':'สร้างร่าง')}</button>
    </div>
   </div>
  </form>
  <small>{en?'Uses your saved AI Instructions, logo, brand style and contact banner. This one-time idea does not change the weekly schedule or saved prompts. Review is required before publishing.':'ใช้คำสั่ง AI โลโก้ รูปแบบแบรนด์ และแถบติดต่อที่ตั้งไว้ ไอเดียนี้ใช้ครั้งเดียว ไม่เปลี่ยนตารางรายสัปดาห์หรือคำสั่งที่บันทึกไว้ ต้องตรวจทานก่อนเผยแพร่'}</small>
  <div role="status" aria-live="polite">
   {job?.stage==='EMPTY'&&<p>{en?'No draft was created because the idea did not pass the evidence checks. Add more detail or try another angle.':'ยังไม่ได้สร้างร่าง เพราะไอเดียไม่ผ่านการตรวจสอบหลักฐาน โปรดเพิ่มรายละเอียดหรือลองมุมใหม่'} {job.reason}</p>}
   {job?.stage==='FAILED'&&<p>{en?'Generation could not be completed. Your idea is still here; you can try again.':'ไม่สามารถสร้างร่างได้ ไอเดียยังอยู่ คุณสามารถลองใหม่ได้'}</p>}
   {job?.stage==='TIMED_OUT'&&<p>{en?'Generation is taking longer than expected. Check All Drafts before starting another request.':'ใช้เวลาสร้างนานกว่าที่คาด โปรดตรวจสอบร่างทั้งหมดก่อนส่งคำขอใหม่'} <button type="button" className="outline" onClick={()=>setJob({...job,stage:'QUEUED'})}>{en?'Check again':'ตรวจสอบอีกครั้ง'}</button></p>}
  </div>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
