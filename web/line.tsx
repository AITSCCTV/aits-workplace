import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './sync.css';
function App(){
 const [messages,setMessages]=useState<any[]>([]),[customer,setCustomer]=useState(new URLSearchParams(location.search).get('customer')||''),[cursor,setCursor]=useState<string|null>(null),[asOf,setAsOf]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const requestId=useRef(0),loading=useRef(false);
 async function load(older=false){if(loading.current)return;loading.current=true;setBusy(true);const id=++requestId.current;try{
  const query=new URLSearchParams();if(customer)query.set('customer',customer);if(older&&cursor)query.set('cursor',cursor);
  const r=await fetch('/api/line?'+query);const data=await r.json();if(!r.ok)throw Error(data.error||'อ่านข้อมูลไม่ได้');if(id!==requestId.current)return;
  setMessages(previous=>older?[...previous,...data.messages.filter((m:any)=>!previous.some(p=>p.id===m.id))]:data.messages);setCursor(data.nextCursor);setAsOf(data.asOf);setError('');
 }catch(e:any){if(id===requestId.current)setError(e.message);}finally{if(id===requestId.current){loading.current=false;setBusy(false);}}}
 useEffect(()=>{loading.current=false;setMessages([]);setCursor(null);load();const timer=setInterval(()=>{if(!document.hidden)load()},60000);return()=>{clearInterval(timer);requestId.current++;loading.current=false;}},[customer]);
 return <main className="sync-page"><header><a href="../">← บอร์ดงาน</a><a href="../calendar/">ปฏิทิน</a><a href="../../">หน้าโปรแกรม</a></header><h1>LINE · คลังข้อความ</h1>
 <p>อ่านจากคลัง LINE เดิมโดยตรง · รีเฟรชทุก 60 วินาทีเมื่อเปิดหน้านี้ · อ่านอย่างเดียว</p><p>แสดงเฉพาะข้อความที่เข้าคลังแล้ว ไม่ได้อ่านแชทส่วนตัวอื่นหรือดาวน์โหลดไฟล์แนบ</p>
 <section className="sync-controls"><button disabled={busy} onClick={()=>load()}>รีเฟรชข้อความล่าสุด</button>{customer&&<button onClick={()=>setCustomer('')}>กลับข้อความทั้งหมด</button>}<span>อ่านล่าสุด: {asOf?new Date(asOf).toLocaleString((window as any).AITS_I18N.locale(),{timeZone:'Asia/Bangkok'}):'—'}</span></section>
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">กำลังโหลด…</p>}{!busy&&!error&&!messages.length&&<p>ไม่พบข้อความในคลัง</p>}
 <section aria-label="ข้อความ LINE">{messages.map(m=><article key={m.id}><div><button data-no-translate onClick={()=>setCustomer(m.customer_id)}>{m.customer_name}</button><time>{m.timestamp}</time><span>{m.sender}</span></div><p data-no-translate style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.message||'ข้อความที่ไม่ใช่ตัวอักษร'}</p>{m.message_type!=='text'&&<small>{m.message_type} · ไม่ดาวน์โหลดไฟล์แนบ</small>}</article>)}</section>
 {cursor&&<button disabled={busy} onClick={()=>load(true)}>โหลดข้อความก่อนหน้า</button>}<p>รายการล่าสุดแสดงก่อน · เวลาในข้อความใช้รูปแบบจากคลังต้นทาง · การรีเฟรชจะกลับไปแสดง 50 ข้อความล่าสุด</p></main>;
}
createRoot(document.getElementById('app')!).render(<App/>);
