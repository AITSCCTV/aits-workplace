import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('dist'), generated=path.resolve('.build');
const base=(process.env.PAGES_BASE_PATH||'/aits-workplace/').replace(/\/$/,'')+'/';
if(!/^\/[a-zA-Z0-9/_-]*\/$/.test(base))throw Error('Invalid base path');
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true}); await mkdir(generated,{recursive:true});
const config=JSON.parse(await readFile('config/runtime.json','utf8'));
const original={workplace:'https://aits-workplace.aitscctv.chatgpt.site',inventory:'https://aits-inventory.aitscctv.chatgpt.site','project-board':'https://aits-project-board.aitscctv.chatgpt.site','design-studio':'https://aits-design-studio.aitscctv.chatgpt.site'};
const local={workplace:base,inventory:base+'inventory/','project-board':base+'project-board/','design-studio':base+'design-studio/'};
function links(text){for(const key of Object.keys(original))text=text.replaceAll(original[key],local[key].replace(/\/$/,''));return text;}
const runtime=await readFile('web/runtime.js','utf8');
await writeFile(out+'/runtime.js',runtime);
function inject(html,app){if(!html.includes('<head>'))html=html.replace(/(<html[^>]*>)/i,'$1<head>').replace('<body>','</head><body>');return html.replace('<head>','<head><script>window.AITS_CONFIG='+JSON.stringify({app,base,apiOrigin:config.apiOrigins[app]||'',original:original[app]}).replaceAll('<','\\u003c')+';</script><script src="'+base+'runtime.js"></script>');}
await cp('sites/workplace/dist',out,{recursive:true});
let hub=links(await readFile(out+'/index.html','utf8')).replace('● พื้นที่ทำงานส่วนตัว','AITS · GitHub Pages');
await writeFile(out+'/index.html',inject(hub,'workplace'));
await cp('sites/design-studio/public',out+'/design-studio',{recursive:true});
await writeFile(out+'/design-studio/index.html',inject(links(await readFile(out+'/design-studio/index.html','utf8')),'design-studio'));
const routes=[['inventory','', 'app/page.tsx'],['project-board','','app/page.tsx'],['project-board','calendar','app/calendar/page.tsx'],['project-board','projects','app/projects/page.tsx'],['project-board','service','app/service/page.tsx'],['project-board','forms/sales','app/forms/[type]/page.tsx'],['project-board','forms/survey','app/forms/[type]/page.tsx']];
for(const [app,route,component] of routes){
 const id=app+'-'+(route.replaceAll('/','-')||'home');
 const entry=generated+'/'+id+'.tsx';
 const props=route.startsWith('forms/')?' params={Promise.resolve({type:'+JSON.stringify(route.split('/')[1])+'})}':'';
 await writeFile(entry,`import React,{Suspense} from 'react';import {createRoot} from 'react-dom/client';import Page from '../sites/${app}/${component}';import '../sites/${app}/app/globals.css';createRoot(document.getElementById('app')!).render(<Suspense fallback={<p>กำลังโหลด…</p>}><Page${props}/></Suspense>);`);
 await build({entryPoints:[entry],outfile:out+'/assets/'+id+'.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022',plugins:[{name:'pages-links',setup(b){b.onLoad({filter:/\.(tsx|ts|mjs)$/},async args=>{if(!args.path.includes(path.sep+'sites'+path.sep))return;let contents=await readFile(args.path,'utf8');contents=contents.replace(/href="\/(?!\/)([^"\n]*)"/g,(_,p)=>`href="${base}${app}/${p}${p&&!p.includes('#')&&!p.endsWith('/')?'/':''}"`);contents=contents.replace("href={'/forms/'+type}",`href={'${base}${app}/forms/'+type+'/'}`);return{contents:links(contents),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'js'};});}}]});
 const dir=out+'/'+app+'/'+route;await mkdir(dir,{recursive:true});
 const title=app==='inventory'?'AITS Inventory':'AITS Project Board';
 await writeFile(dir+'/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${base}assets/${id}.css"></head><body><div id="app"></div><script type="module" src="${base}assets/${id}.js"></script></body></html>`,app));
}
await writeFile(out+'/.nojekyll','');
await writeFile(out+'/404.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found · AITS</title><h1>Page not found</h1><a href="${base}">Return to AITS Workplace</a></html>`);
console.log('Built all four interfaces and seven React routes at '+base);
