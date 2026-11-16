export const UNITS = ['ชิ้น','ตัว','ใบ','เส้น','คู่','ชุด','เมตร','ม้วน','กล่อง','กิโลกรัม'] as const;
export type Item={id:string;name:string;sku:string;min:number|null;unit:string;decimals:number};
export type Move={id:string;item:string;type:string;qty:number;job:string;at:string};
export const SCALE=1000;
// Decimal text only: never coerce empty, fractions, scientific notation or dates.
export function quantity(value:unknown,decimals:number,allowZero=false):number {
  if(typeof value!=='string'&&typeof value!=='number')throw Error('กรอกจำนวนที่ทราบแน่ชัด');
  const text=String(value).trim();
  if(!/^\d+(\.\d{1,3})?$/.test(text))throw Error('ใช้ตัวเลขทศนิยม เช่น 0.5 ไม่ใช้ 1/2 วันที่ หรือเครื่องหมายคั่น');
  const n=Number(text); const scaled=Math.round(n*SCALE);
  if(!Number.isFinite(n)||n>1000000000||n<0||(!allowZero&&n===0)||Math.abs(n*SCALE-scaled)>0.0001||(decimals===0&&!Number.isInteger(n)))throw Error(decimals===0?'หน่วยนี้รับเฉพาะจำนวนเต็มที่มากกว่าศูนย์ (ขั้นต่ำเป็นศูนย์ได้)':'จำนวนต้องมากกว่าศูนย์ ไม่เกิน 1,000,000,000 และทศนิยมไม่เกิน 3 ตำแหน่ง');
  return scaled/SCALE;
}
export function normalizeItem(item:any):Item {return {...item,unit:item.unit??'ชิ้น',decimals:item.decimals??0,min:item.min??null};}
export function stock(items:Move[],id:string){return items.filter(x=>x.item===id).reduce((sum,x)=>sum+(x.type==='เบิก'?-1:1)*Math.round(x.qty*SCALE),0)/SCALE;}
export function formatQty(n:number|null){return n===null?'ยังไม่ระบุ':n.toLocaleString('th-TH',{maximumFractionDigits:3});}
