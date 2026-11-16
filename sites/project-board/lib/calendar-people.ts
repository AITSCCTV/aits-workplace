// Exact aliases only. Never infer staff identity from calendar ownership or customer names.
const aliases:Record<string,string>={'พี่ซุป':'ซุป','พี่หมู':'หมู','คุณหมู':'หมู','คุณเอ':'เอ','Etan':'อิธาน','Ethan':'อิธาน','อีธาน':'อิธาน'};
export const canonical=(name:string)=>aliases[name.trim()]||name.trim();
const colors:Record<string,string>={'หมู':'#92400e','ซุป':'#7e22ce','เอ':'#1d4ed8','อิธาน':'#047857','ช่างตุ๊ก':'#be123c','โอม':'#4338ca','ช่างดุ่ย':'#0e7490','คุณชม':'#a21caf','ช่างโส':'#9a3412'};
export function personColor(name:string){const n=canonical(name);if(!n||n==='ยังไม่ระบุ')return '#64748b';if(colors[n])return colors[n];let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))>>>0;return `hsl(${h%360} 65% 32%)`;}
export const names=(values:string[])=>Array.from(new Set(values.map(canonical).filter(Boolean)));
export function taskPeople(owner:string){return names((owner||'').split(/[+,\/、]| และ /).map(s=>s.trim()).filter(s=>s&&!/ยังไม่|ไม่ระบุ|รอยืนยัน/.test(s)));}
