import {validDate,thaiDay} from './project-progress.mjs';
export const movementLabels={receive:'รับเข้าโครงการ',use:'ใช้ติดตั้งจริง',return:'คืนคลัง',waste:'เสียหาย/สูญเสีย'};
const txt=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
export function amount(v,allowZero=false){if(typeof v!=='number'||!Number.isFinite(v)||v<(allowZero?0:0.001)||v>1e9||Math.abs(v*1000-Math.round(v*1000))>0.00001)throw Error('จำนวนต้องเป็นตัวเลข สูงสุด 3 ตำแหน่ง');return v}
const id=v=>{if(typeof v!=='string'||!/^[-\w]{1,80}$/.test(v))throw Error('รหัสรายการไม่ถูกต้อง');return v};
function common(x){const date=txt(x.date);if(!validDate(date)||date>thaiDay())throw Error('วันที่รายการต้องถูกต้องและไม่อยู่ในอนาคต');if(!txt(x.evidence))throw Error('กรุณาระบุหลักฐานหรือเลขเอกสาร');return {id:id(x.id),date,evidence:txt(x.evidence,2000),by:txt(x.by),note:txt(x.note,1000)}}
function unique(xs){if(new Set(xs.map(x=>x.id)).size!==xs.length)throw Error('รหัสรายการซ้ำ')}
export function validateWorkspace(w={}){
 const materials=(w.materials||[]).map(x=>{if(!txt(x.name)||!txt(x.unit,40))throw Error('ระบุชื่อวัสดุและหน่วย');return {id:id(x.id),name:txt(x.name),unit:txt(x.unit,40),required:x.required==null?null:amount(x.required,true)}});
 if(materials.length>300)throw Error('วัสดุเกิน 300 รายการ');unique(materials);const mids=new Set(materials.map(x=>x.id));
 const movements=(w.movements||[]).map(x=>{if(!mids.has(x.materialId)||!Object.hasOwn(movementLabels,x.type))throw Error('วัสดุหรือประเภทรายการไม่ถูกต้อง');return {...common(x),materialId:x.materialId,type:x.type,quantity:amount(x.quantity),unitCost:x.unitCost==null?null:amount(x.unitCost,true)}});
 if(movements.length>2000)throw Error('รายการเคลื่อนไหวเกิน 2000');unique(movements);
 const balances=new Map(materials.map(x=>[x.id,0]));for(const x of movements){const n=balances.get(x.materialId)+(x.type==='receive'?1:-1)*Math.round(x.quantity*1000);if(n<0)throw Error('ใช้/คืน/เสียหายเกินของที่รับเข้าโครงการ');balances.set(x.materialId,n)}
 const costValues=movements.map(x=>x.unitCost==null?0:Math.round(x.quantity*x.unitCost*100));if(costValues.some(x=>!Number.isSafeInteger(x))||!Number.isSafeInteger(costValues.reduce((a,b)=>a+b,0)))throw Error('มูลค่าเกินขอบเขตที่คำนวณได้ปลอดภัย');
 const costs=(w.costs||[]).map(x=>{if(!txt(x.title))throw Error('ระบุรายการต้นทุน');return {...common(x),title:txt(x.title),amount:x.amount==null?null:amount(x.amount,true)}});unique(costs);if(costs.length>1000)throw Error('ต้นทุนเกิน 1000 รายการ');
 const requests=(w.requests||[]).map(x=>{if(!mids.has(x.materialId)||!['draft','queued','reviewing','received','cancelled'].includes(x.status))throw Error('คำขอไม่ถูกต้อง');if(x.needed&&!validDate(x.needed))throw Error('วันที่ต้องใช้ไม่ถูกต้อง');return {...common(x),materialId:x.materialId,quantity:amount(x.quantity),needed:txt(x.needed),status:x.status}});unique(requests);if(requests.length>1000)throw Error('คำขอเกิน 1000');
 if(!Number.isSafeInteger(costValues.reduce((a,b)=>a+b,0)+costs.reduce((n,c)=>n+Math.round((c.amount||0)*100),0)))throw Error('มูลค่ารวมสูงเกินไป');
 return {materials,movements,costs,requests};
}
export function workspaceSummary(w){const rows=w.materials.map(m=>{let received=0,used=0,returned=0,waste=0;for(const x of w.movements.filter(x=>x.materialId===m.id)){const q=Math.round(x.quantity*1000);if(x.type==='receive')received+=q;if(x.type==='use')used+=q;if(x.type==='return')returned+=q;if(x.type==='waste')waste+=q}const balance=(received-used-returned-waste)/1000;return {...m,received:received/1000,used:used/1000,returned:returned/1000,waste:waste/1000,balance,shortage:m.required==null?null:Math.max(0,Math.round((m.required-used/1000-balance)*1000)/1000)}});
 let known=0,missing=0;for(const x of w.movements.filter(x=>x.type==='use'||x.type==='waste')){if(x.unitCost==null)missing++;else known+=Math.round(x.quantity*x.unitCost*100)}for(const x of w.costs){if(x.amount==null)missing++;else known+=Math.round(x.amount*100)}return {rows,knownCost:known/100,missingCost:missing};
}
