import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import '../sites/project-board/lib/project-progress.test.mjs';
import '../sites/project-board/lib/project-workspace.test.mjs';
import '../sites/project-board/lib/quote-pilot.test.mjs';
test('all original tracked source files preserved, with one documented private-data exception',async()=>{
 const manifest=JSON.parse(await readFile('migration-manifest.json','utf8'));
 assert.equal(manifest.length,4);
 for(const site of manifest)for(const file of site.files){
  const bytes=await readFile(`sites/${site.site}/${file.path}`);
  if(file.copiedUnchanged)assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`${site.site}/${file.path}`);
  else assert.equal(file.path,'lib/calendar-snapshot.ts');
 }
});
test('unconfigured cloud never reports success or sends private writes elsewhere',async()=>{
 const requests=[];const window={dispatchEvent(){},AITS_CONFIG:{app:'inventory',apiOrigin:''},fetch:(...args)=>{requests.push(args);return Promise.resolve(new Response('{}'))}};
 vm.runInNewContext(await readFile('web/runtime.js','utf8'),{window,URL,Response,Request,Headers,Event,sessionStorage:{getItem:()=>JSON.stringify({token:"test-session",email:"test@example.com"})},location:{href:'https://aitscctv.github.io/aits-workplace/inventory/',origin:'https://aitscctv.github.io'},document:{addEventListener(){}}});
 const response=await window.fetch('/api/stock',{method:'POST',body:'private'});
 assert.equal(response.status,503);assert.ok((await response.json()).error);assert.equal(requests.length,0);
 await window.fetch('https://example.com/data');assert.equal(requests.length,1);
});
test('configured API preserves method, body, and query when routed to backend',async()=>{
 const requests=[];const window={dispatchEvent(){},AITS_CONFIG:{app:'project-board',apiOrigin:'https://backend.example'},fetch:(...args)=>{requests.push(args);return Promise.resolve(new Response('{}'))}};
 vm.runInNewContext(await readFile('web/runtime.js','utf8'),{window,URL,Response,Request,Headers,Event,sessionStorage:{getItem:()=>JSON.stringify({token:"test-session",email:"test@example.com"})},location:{href:'https://aitscctv.github.io/aits-workplace/project-board/',origin:'https://aitscctv.github.io'},document:{addEventListener(){}}});
 await window.AITS_SESSION.ready;requests.length=0;
 await window.fetch('https://aitscctv.github.io/api/projects?id=abc',{method:'POST',body:'data'});
 assert.equal(requests[0][0].href,'https://backend.example/api/projects?id=abc');assert.ok(requests[0][1].body);assert.equal(requests[0][1].method,'POST');assert.equal(requests[0][1].credentials,'omit');
});
