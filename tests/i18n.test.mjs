import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('web/i18n/en.json','utf8'));
const runtime=await readFile('web/i18n.js','utf8');
function language(saved){
 const window={AITS_EN:catalog,alert(){},confirm(){},prompt(){}};
 vm.runInNewContext(runtime,{window,localStorage:{getItem(){if(saved instanceof Error)throw saved;return saved;}},document:{addEventListener(){}},navigator:{language:'en-US'}});
 return window.AITS_I18N;
}
test('Thai is default regardless of browser language or unavailable storage',()=>{
 for(const saved of [null,'fr',new Error('blocked')])assert.equal(language(saved).language(),'th');
 assert.equal(language(null).translate('Sign in to AITS'),'เข้าสู่ระบบ AITS');
 assert.equal(language('en').locale(),'en-GB');
});
test('English translates UI and dynamic quantities while retaining original user content',()=>{
 const i=language('en');assert.equal(i.translate('กำลังบันทึก…'),'Saving…');
 assert.equal(i.translate('พบ 3 แบบ'),'Found 3 plans');
 i.protectData({customer:'บริษัท ตัวอย่าง',title:'งานติดตั้งระบบใหม่',items:[{name:'กล้อง'}]});
 assert.equal(i.translate('บริษัท ตัวอย่าง'),'บริษัท ตัวอย่าง');
 assert.equal(i.translate('งานติดตั้งระบบใหม่'),'งานติดตั้งระบบใหม่');
 assert.equal(i.translate('กล้อง'),'กล้อง');
 assert.equal(i.translate('บันทึก Cloud แล้ว: บริษัท ตัวอย่าง'),'Saved to cloud: บริษัท ตัวอย่าง');
 assert.equal(i.translate('ชื่อเฉพาะที่ไม่มีในพจนานุกรม'),'ชื่อเฉพาะที่ไม่มีในพจนานุกรม');
});
test('catalog covers Thai phrases in shipped UI and API validation sources',async()=>{
 const missing=new Set();
 async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  const p=dir+'/'+entry.name;if(entry.isDirectory()){await scan(p);continue;}
  if(!/\.(tsx?|m?js|html)$/.test(p)||/test\.|connector|calendar-snapshot|\/ui\//.test(p))continue;
  for(const phrase of (await readFile(p,'utf8')).match(/[\u0e00-\u0e7f]+(?:[ \t]+[\u0e00-\u0e7f]+)*/g)||[])if(!catalog[phrase])missing.add(phrase);
 }}
 for(const app of ['project-board','inventory'])for(const folder of ['app','lib','components'])await scan('sites/'+app+'/'+folder);
 for(const dir of ['sites/workplace/dist','sites/design-studio/public','sites/design-studio/worker'])await scan(dir);
 assert.deepEqual([...missing],[]);
});
