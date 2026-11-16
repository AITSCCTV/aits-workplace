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
const english=JSON.parse(await readFile('web/i18n/en.json','utf8'));
await writeFile(out+'/i18n.js','window.AITS_EN='+JSON.stringify(english).replaceAll('<','\\u003c')+';\n'+await readFile('web/i18n.js','utf8'));
function inject(html,app){if(!html.includes('<head>'))html=html.replace(/(<html[^>]*>)/i,'$1<head>').replace('<body>','</head><body>');return html.replace('<head>','<head><script>window.AITS_CONFIG='+JSON.stringify({app,base,apiOrigin:config.apiOrigins[app]||'',original:original[app]}).replaceAll('<','\\u003c')+';</script><script src="'+base+'i18n.js"></script><script src="'+base+'runtime.js"></script>');}
const locale=text=>text.replace(/(toLocale(?:DateString|TimeString|String)\()(['"])th-TH\2/g,'$1window.AITS_I18N.locale()').replace(/(Intl.DateTimeFormat\()(['"])th-TH\2/g,'$1window.AITS_I18N.locale()');
await cp('sites/workplace/dist',out,{recursive:true});
let hub=links(await readFile(out+'/index.html','utf8')).replace('● พื้นที่ทำงานส่วนตัว','AITS · GitHub Pages');
await writeFile(out+'/index.html',inject(hub,'workplace'));
await cp('sites/design-studio/public',out+'/design-studio',{recursive:true});
await writeFile(out+'/design-studio/index.html',inject(links(await readFile(out+'/design-studio/index.html','utf8')),'design-studio'));
for(const file of ['app.js','cloud.js'])await writeFile(out+'/design-studio/'+file,locale(await readFile(out+'/design-studio/'+file,'utf8')).replaceAll("name:'แบบสำรวจใหม่'","name:window.AITS_I18N.translate('แบบสำรวจใหม่')"));
const routes=[['inventory','', 'app/page.tsx'],['project-board','','app/page.tsx'],['project-board','calendar','app/calendar/page.tsx'],['project-board','projects','app/projects/page.tsx'],['project-board','service','app/service/page.tsx'],['project-board','forms/sales','app/forms/[type]/page.tsx'],['project-board','forms/survey','app/forms/[type]/page.tsx']];
for(const [app,route,component] of routes){
 const id=app+'-'+(route.replaceAll('/','-')||'home');
 const entry=generated+'/'+id+'.tsx';
 await writeFile(entry,`import React,{Suspense,useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import Page from '../sites/${app}/${component}';import '../sites/${app}/app/globals.css';const routeParams=${route.startsWith('forms/')?'Promise.resolve({type:'+JSON.stringify(route.split('/')[1])+'})':'undefined'};function LocalizedPage(){const [,refresh]=useState(0);useEffect(()=>{const update=()=>refresh(n=>n+1);window.addEventListener('aits-language-change',update);return()=>window.removeEventListener('aits-language-change',update)},[]);return <Page${route.startsWith('forms/')?' params={routeParams}':''}/>;}createRoot(document.getElementById('app')!).render(<Suspense fallback={<p>กำลังโหลด…</p>}><LocalizedPage/></Suspense>);`);
 await build({entryPoints:[entry],outfile:out+'/assets/'+id+'.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022',plugins:[{name:'pages-links',setup(b){b.onLoad({filter:/\.(tsx|ts|mjs)$/},async args=>{if(!args.path.includes(path.sep+'sites'+path.sep))return;let contents=await readFile(args.path,'utf8');contents=contents.replace(/href="\/(?!\/)([^"\n]*)"/g,(_,p)=>`href="${base}${app}/${p}${p&&!p.includes('#')&&!p.endsWith('/')?'/':''}"`);contents=contents.replace("href={'/forms/'+type}",`href={'${base}${app}/forms/'+type+'/'}`);return{contents:locale(links(contents)),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'js'};});}}]});
 const dir=out+'/'+app+'/'+route;await mkdir(dir,{recursive:true});
 const title=app==='inventory'?'AITS Inventory':'AITS Project Board';
 await writeFile(dir+'/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${base}assets/${id}.css"></head><body><div id="app"></div><script type="module" src="${base}assets/${id}.js"></script></body></html>`,app));
}
await writeFile(out+'/.nojekyll','');
await writeFile(out+'/404.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Page not found · AITS</title></head><body><h1>Page not found</h1><a href="${base}">Return to AITS Workplace</a></body></html>`,'workplace'));
console.log('Built all four interfaces and seven React routes at '+base);
