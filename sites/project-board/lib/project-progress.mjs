import {validateQuote} from './quote-pilot.mjs';
import {validateWorkspace} from './project-workspace.mjs';
export function thaiDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
const dayMs=86400000;
export function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v}
function txt(v,max=300){return typeof v==='string'?v.trim().slice(0,max):''}
function num(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label);return v}
export function validateProject(p){
 if(!p||typeof p!=='object')throw Error('ข้อมูลไม่ถูกต้อง');
 const name=txt(p.name);if(!name)throw Error('กรุณาระบุชื่อโครงการ');
 if(!Array.isArray(p.sites)||p.sites.length<1||p.sites.length>100)throw Error('ต้องมีจุดงาน 1–100 จุด');
 const ids=new Set();
 const sites=p.sites.map(s=>{if(!s.id||ids.has(s.id)||!/^[\w-]{1,80}$/.test(s.id))throw Error('รหัสจุดงานซ้ำหรือไม่ถูกต้อง');ids.add(s.id);
 if(!txt(s.name))throw Error('ระบุชื่อจุดงาน');if(!Array.isArray(s.stages)||s.stages.length>30)throw Error('แต่ละจุดมีขั้นตอนได้ 0–30 รายการ');
 const stageIds=new Set();const stages=s.stages.map(t=>{if(!t.id||stageIds.has(t.id)||!/^[\w-]{1,80}$/.test(t.id))throw Error('รหัสขั้นตอนซ้ำหรือไม่ถูกต้อง');stageIds.add(t.id);if(!txt(t.name))throw Error('ระบุชื่อขั้นตอน');
 const total=num(t.total,0.000001,1e9,'ปริมาณรวมต้องมากกว่า 0');const weight=num(t.weight,0.000001,1e6,'น้ำหนักต้องมากกว่า 0');
 const actual=t.actual===null?null:num(t.actual,0,total,'ปริมาณทำจริงต้องอยู่ระหว่าง 0 ถึงปริมาณรวม');
 const start=txt(t.start),end=txt(t.end),asOf=txt(t.asOf),forecast=txt(t.forecast);
 for(const v of [start,end,asOf,forecast])if(v&&!validDate(v))throw Error('วันที่ไม่ถูกต้อง');
 if((start&&!end)||(!start&&end)||start>end)throw Error('แผนต้องมีวันเริ่มและสิ้นสุดตามลำดับ');
 if(actual!==null&&(!asOf||!txt(t.evidence,2000)))throw Error('ปริมาณจริงต้องมีวันที่รายงานและหลักฐาน/หมายเหตุ');
 if(asOf&&asOf>thaiDay())throw Error('วันที่ผลงานจริงต้องไม่อยู่ในอนาคต');
 return {id:t.id,name:txt(t.name),weight,total,unit:txt(t.unit,50),actual,start,end,asOf,forecast,owner:txt(t.owner),evidence:txt(t.evidence,2000),blocker:txt(t.blocker,1000)};
 });return {id:s.id,name:txt(s.name),location:txt(s.location,1000),coordinates:txt(s.coordinates,300),source:txt(s.source,2000),weight:num(s.weight,0.000001,1e6,'น้ำหนักจุดต้องมากกว่า 0'),stages};});
 return {name,customer:txt(p.customer),notes:txt(p.notes,3000),sites,quote:validateQuote(p.quote),workspace:validateWorkspace(p.workspace)};
}
export function planned(stage,day){if(!stage.start||!stage.end)return null;if(day<stage.start)return 0;if(day>=stage.end)return 100;return Math.max(0,Math.min(100,(Date.parse(day)-Date.parse(stage.start)+dayMs)/(Date.parse(stage.end)-Date.parse(stage.start)+dayMs)*100))}
export function metrics(project,day=thaiDay()){
 const totalSiteWeight=project.sites.reduce((n,s)=>n+s.weight,0);let actual=0,plan=0,known=0,plannedCoverage=0,complete=0,count=0;
 for(const s of project.sites){const tw=s.stages.reduce((n,t)=>n+t.weight,0);for(const t of s.stages){const w=s.weight/totalSiteWeight*t.weight/tw;count++;if(t.actual!==null){actual+=w*t.actual/t.total*100;known+=w;if(t.actual===t.total)complete++;}const p=planned(t,day);if(p!==null){plan+=w*p;plannedCoverage+=w}}}
 const allKnown=known>0.999999,allPlanned=plannedCoverage>0.999999;
 return {actual:allKnown?actual:null,recorded:actual,plan:allPlanned?plan:null,known:known*100,plannedCoverage:plannedCoverage*100,variance:allKnown&&allPlanned?actual-plan:null,complete,count};
}
export function template28(){const names=['สำรวจและอนุมัติแบบ','งานฐานราก','ติดตั้งเสา','ติดตั้งระบบและเดินสาย','ทดสอบและส่งมอบ'];return {name:'โครงการหอกระจายข่าว อำเภอเมืองตราด 28 จุด',customer:'',notes:'โครงสร้างเริ่มต้น 28 จุด A1–A10, B1–B10, C1–C8 ตามข้อมูลผู้ใช้ • ขั้นตอนและน้ำหนักเท่ากันเป็นแบบตั้งต้น ต้องตรวจและปรับก่อนใช้วัดผลงาน ไม่ได้ใส่ผลจริงหรือกำหนดการเดิม',sites:['A','B','C'].flatMap(g=>Array.from({length:g==='C'?8:10},(_,i)=>({id:`${g}${i+1}`,name:`${g}${i+1}`,weight:1,stages:names.map((name,j)=>({id:`stage-${j+1}`,name,weight:1,total:1,unit:'งาน',actual:null,start:'',end:'',asOf:'',forecast:'',owner:'',evidence:'',blocker:''}))})))}}
