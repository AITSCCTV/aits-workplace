export const statuses=['open','waiting','restored','confirmed'];
export function validateRecord(input){
 if(!input||typeof input!=='object')throw Error('ข้อมูลไม่ถูกต้อง');
 const fields=['customer','customerId','projectId','site','contact','phone','technician','date','system','asset','symptom','action','parts','testResult','evidence','nextStep','nextOwner','nextDate','trainee','topics','trainingResult','manualLink'];
 const d={};for(const k of fields)d[k]=typeof input[k]==='string'?input[k].trim().slice(0,6000):'';
 d.kind=input.kind;d.mode=input.mode;d.status=input.status;
 if(!['service','training'].includes(d.kind)||!['onsite','remote','phone'].includes(d.mode)||!statuses.includes(d.status))throw Error('ประเภทหรือสถานะไม่ถูกต้อง');
 if(!d.customer||!d.technician||!d.date||!d.system)throw Error('กรุณาระบุลูกค้า ผู้ดำเนินการ วันที่ และระบบ');
 for(const k of ['date','nextDate'])if(d[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(d[k])||new Date(d[k]+'T00:00:00Z').toISOString().slice(0,10)!==d[k]))throw Error('วันที่ไม่ถูกต้อง');
 if(d.manualLink&&!d.manualLink.startsWith('https://'))throw Error('ลิงก์คู่มือต้องเป็น HTTPS');
 if(d.kind==='service'&&!d.symptom)throw Error('กรุณาระบุอาการหรือวัตถุประสงค์บริการ');
 if(d.kind==='training'&&(!d.trainee||!d.topics))throw Error('กรุณาระบุผู้รับการสอนและหัวข้อ');
 if(['restored','confirmed'].includes(d.status)&&(!d.testResult||!d.evidence))throw Error('ระบุผลทดสอบและหลักฐานก่อนปิดงาน');
 if(d.status==='confirmed'&&!d.contact)throw Error('ระบุผู้ยืนยันรับงาน');
 if(d.status==='waiting'&&(!d.nextStep||!d.nextOwner))throw Error('ระบุสิ่งที่รอและผู้ติดตาม');
 return d;
}
