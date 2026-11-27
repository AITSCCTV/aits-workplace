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
 useEffect(()=>{try{const saved=sessionStorage.getItem(storageKey);if(saved)setJob({id:saved,stage:'QUEUED'});}catch{}},[]);
 useEffect(()=>{
  if(!job?.id||terminal.includes(job.stage))return;
  let stopped=false,timer:number;
  const poll=async()=>{try{
   const result=await apiClient.get('/api/admin/content-studio/research/'+job.id) as Job;
   if(stopped)return;setError('');setJob(result);
   if(terminal.includes(result.stage)){try{sessionStorage.removeItem(storageKey);}catch{}key.current='';if(result.stage==='COMPLETE')ready.current(result.draftIds?.[0]);return;}
  }catch{if(!stopped)setError(en?'Connection interrupted. Checking again automatically; do not submit the idea again.':'การเชื่อมต่อขัดข้อง กำลังตรวจสอบอีกครั้งโดยอัตโนมัติ ไม่ต้องส่งไอเดียซ้ำ');}
  if(!stopped)timer=window.setTimeout(poll,5000);
  };void poll();return()=>{stopped=true;window.clearTimeout(timer);};
 },[job?.id,job?.stage,en]);
 async function submit(event:React.FormEvent){event.preventDefault();if(active||disabled||prompt.trim().length<10)return;setSubmitting(true);setError('');
  key.current ||= crypto.randomUUID().replaceAll('-','');
  try{const result=await apiClient.post('/api/admin/content-studio/ideas',{prompt,style,requestId:key.current}) as {id:string};setJob({id:result.id,stage:'QUEUED'});try{sessionStorage.setItem(storageKey,result.id);}catch{}}
  catch(e){setError((e as Error).message);}finally{setSubmitting(false);}
 }
 return <section className="idea-generator" aria-labelledby="idea-title">
  <h2 id="idea-title">{en?'Generate from an idea':'สร้างร่างจากไอเดีย'}</h2>
  <p>{en?'Have a topic in mind? Describe it below. AI will research it and create one draft with captions and a branded image in All Drafts.':'มีหัวข้อในใจใช่ไหม? บอกไอเดียด้านล่าง AI จะค้นคว้าและสร้างร่าง 1 โพสต์ พร้อมข้อความและภาพตามแบรนด์ไว้ในร่างทั้งหมด'}</p>
  <form onSubmit={submit}>
   <label htmlFor="idea-prompt">{en?'Your idea':'ไอเดียของคุณ'}</label>
   <textarea id="idea-prompt" rows={4} minLength={10} maxLength={4000} required value={prompt} disabled={active||disabled} onChange={e=>{setPrompt(e.target.value);key.current='';}} placeholder={en?'Example: Explain how PoE CCTV can help a small shop reduce cabling, and what owners should check before installation.':'เช่น อธิบายว่ากล้อง PoE ช่วยร้านค้าขนาดเล็กลดการเดินสายได้อย่างไร และควรตรวจสอบอะไรบ้างก่อนติดตั้ง'} />
   <div className="idea-options"><label htmlFor="idea-style">{en?'Content style':'รูปแบบเนื้อหา'}<select id="idea-style" value={style} disabled={active||disabled} onChange={e=>{setStyle(e.target.value);key.current='';}}><option value="MARKETING">{en?'Marketing / buying guide':'การตลาด / แนะนำการเลือกซื้อ'}</option><option value="EDUCATIONAL">{en?'Educational / technical':'ความรู้ / เทคนิค'}</option></select></label><span>{prompt.length.toLocaleString()} / 4,000</span><button disabled={active||disabled||prompt.trim().length<10}>{active?(en?'Generating…':'กำลังสร้าง…'):(en?'Generate draft':'สร้างร่าง')}</button></div>
  </form>
  <small>{en?'Uses your saved AI Instructions, logo, brand style and contact banner. This one-time idea does not change the weekly schedule or saved prompts. Review is required before publishing.':'ใช้คำสั่ง AI โลโก้ รูปแบบแบรนด์ และแถบติดต่อที่ตั้งไว้ ไอเดียนี้ใช้ครั้งเดียว ไม่เปลี่ยนตารางรายสัปดาห์หรือคำสั่งที่บันทึกไว้ ต้องตรวจทานก่อนเผยแพร่'}</small>
  <div role="status" aria-live="polite">
   {active&&<p>{job?.stage==='PREPARING'?(en?'Preparing your branded image and saving the draft…':'กำลังเตรียมภาพตามแบรนด์และบันทึกร่าง…'):(en?'Researching your idea and checking sources. This can take several minutes.':'กำลังค้นคว้าไอเดียและตรวจสอบแหล่งข้อมูล อาจใช้เวลาหลายนาที')}</p>}
   {job?.stage==='COMPLETE'&&<p>{en?'Your draft is ready in All Drafts. Review the image and captions before posting.':'ร่างพร้อมแล้วในร่างทั้งหมด กรุณาตรวจทานภาพและข้อความก่อนเผยแพร่'} <button type="button" className="outline" onClick={()=>ready.current(job.draftIds?.[0])}>{en?'View draft':'ดูร่าง'}</button></p>}
   {job?.stage==='EMPTY'&&<p>{en?'No draft was created because the idea did not pass the evidence checks. Add more detail or try another angle.':'ยังไม่ได้สร้างร่าง เพราะไอเดียไม่ผ่านการตรวจสอบหลักฐาน โปรดเพิ่มรายละเอียดหรือลองมุมใหม่'} {job.reason}</p>}
   {job?.stage==='FAILED'&&<p>{en?'Generation could not be completed. Your idea is still here; you can try again.':'ไม่สามารถสร้างร่างได้ ไอเดียยังอยู่ คุณสามารถลองใหม่ได้'}</p>}
   {job?.stage==='TIMED_OUT'&&<p>{en?'Generation is taking longer than expected. Check All Drafts before starting another request.':'ใช้เวลาสร้างนานกว่าที่คาด โปรดตรวจสอบร่างทั้งหมดก่อนส่งคำขอใหม่'} <button type="button" className="outline" onClick={()=>setJob({...job,stage:'QUEUED'})}>{en?'Check again':'ตรวจสอบอีกครั้ง'}</button></p>}
  </div>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
