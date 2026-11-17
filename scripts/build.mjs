import {calendarBuild} from '../web/calendar-build.mjs';
import {toolPresentation} from './tool-presentation.mjs';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('dist'), generated=path.resolve('.build');
const base=(process.env.PAGES_BASE_PATH||'/aits-workplace/').replace(/\/$/,'')+'/';
if(base!=='/'&&!/^\/[a-zA-Z0-9/_-]*\/$/.test(base))throw Error('Invalid base path');
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true}); await mkdir(generated,{recursive:true});
const config=JSON.parse(await readFile('config/runtime.json','utf8'));
const original={workplace:'https://aits-workplace.aitscctv.chatgpt.site',inventory:'https://aits-inventory.aitscctv.chatgpt.site','project-board':'https://aits-project-board.aitscctv.chatgpt.site','design-studio':'https://aits-design-studio.aitscctv.chatgpt.site'};
const local={workplace:base,inventory:base+'inventory/','project-board':base+'project-board/','design-studio':base+'design-studio/'};
function links(text){for(const key of Object.keys(original))text=text.replaceAll(original[key],local[key].replace(/\/$/,''));return text;}
await cp('web/workspace.css',out+'/workspace.css');await build({entryPoints:['web/shell.js'],outfile:out+'/shell.js',bundle:true,minify:true,format:'iife',target:'es2022'});await cp('web/login.js',out+'/login.js');await cp('web/login.css',out+'/login.css');
const runtime=await readFile('web/runtime.js','utf8');
await writeFile(out+'/runtime.js',runtime);
const english=JSON.parse(await readFile('web/i18n/en.json','utf8'));
await writeFile(out+'/i18n.js','window.AITS_EN='+JSON.stringify(english).replaceAll('<','\\u003c')+';\n'+await readFile('web/i18n.js','utf8'));
const assetVersion=(process.env.GITHUB_SHA||Date.now().toString()).replace(/[^a-zA-Z0-9]/g,'');
function inject(html,app){if(!html.includes('<head>'))html=html.replace(/(<html[^>]*>)/i,'$1<head>').replace('<body>','</head><body>');return html.replace('</head>','<link rel="stylesheet" href="'+base+'workspace.css"><script defer src="'+base+'shell.js"></script><link rel="stylesheet" href="'+base+'login.css"><script defer src="'+base+'login.js"></script></head>').replace('<head>','<head><script>window.AITS_CONFIG='+JSON.stringify({app,base,apiOrigin:config.apiOrigins[app]||'',original:original[app]}).replaceAll('<','\\u003c')+';</script><script src="'+base+'i18n.js"></script><script src="'+base+'runtime.js"></script>').replace(/((?:src|href)="[^"]+\.(?:js|css))(?:\?[^"]*)?"/g,'$1?v='+assetVersion+'"');}
const locale=text=>text.replace(/(toLocale(?:DateString|TimeString|String)\()(['"])th-TH\2/g,'$1window.AITS_I18N.locale()').replace(/(Intl.DateTimeFormat\()(['"])th-TH\2/g,'$1window.AITS_I18N.locale()');
await cp('sites/workplace/dist',out,{recursive:true});
let hub=links(await readFile(out+'/index.html','utf8')).replace('● พื้นที่ทำงานส่วนตัว','AITS · GitHub Pages');
hub=hub.replace('</body>','<nav style="padding:20px;text-align:center"><a href="'+base+'project-board/line/">LINE · คลังข้อความ</a></nav></body>');
await writeFile(out+'/index.html',inject(hub,'workplace'));
await cp('sites/design-studio/public',out+'/design-studio',{recursive:true});
await writeFile(out+'/design-studio/index.html',inject(links(await readFile(out+'/design-studio/index.html','utf8')),'design-studio'));
for(const file of ['app.js','cloud.js'])await writeFile(out+'/design-studio/'+file,locale(await readFile(out+'/design-studio/'+file,'utf8')).replaceAll("name:'แบบสำรวจใหม่'","name:window.AITS_I18N.translate('แบบสำรวจใหม่')"));
const routes=[['inventory','', 'app/page.tsx'],['project-board','','app/page.tsx'],['project-board','calendar','app/calendar/page.tsx'],['project-board','projects','app/projects/page.tsx'],['project-board','service','app/service/page.tsx'],['project-board','forms/sales','app/forms/[type]/page.tsx'],['project-board','forms/survey','app/forms/[type]/page.tsx']];
for(const [app,route,component] of routes){
 const id=app+'-'+(route.replaceAll('/','-')||'home');
 const entry=generated+'/'+id+'.tsx';
 await writeFile(entry,`import React,{Suspense,useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import Page from '../sites/${app}/${component}';import '../sites/${app}/app/globals.css';const routeParams=${route.startsWith('forms/')?'Promise.resolve({type:'+JSON.stringify(route.split('/')[1])+'})':'undefined'};function LocalizedPage(){const [,refresh]=useState(0);useEffect(()=>{const update=()=>refresh(n=>n+1);window.addEventListener('aits-language-change',update);return()=>window.removeEventListener('aits-language-change',update)},[]);return <Page${route.startsWith('forms/')?' params={routeParams}':''}/>;}createRoot(document.getElementById('app')!).render(<Suspense fallback={<p>กำลังโหลด…</p>}><LocalizedPage/></Suspense>);`);
 await build({entryPoints:[entry],outfile:out+'/assets/'+id+'.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022',plugins:[{name:'pages-links',setup(b){b.onLoad({filter:/\.(tsx|ts|mjs)$/},async args=>{if(!args.path.includes(path.sep+'sites'+path.sep))return;let contents=await readFile(args.path,'utf8');if(args.path.endsWith(path.join('calendar','page.tsx'))){contents=calendarBuild(contents);contents=contents.replace("fetch('/api/tasks')","window.AITS_SESSION.ready.then(()=>window.AITS_SESSION.can('tasks')?fetch('/api/tasks'):Response.json({tasks:[]}))");}
if(args.path.endsWith(path.join('project-board','app','page.tsx')))contents=contents.replace('setTasks(d.tasks);','setTasks(d.tasks);const params=new URLSearchParams(location.search);if(params.has("task")||params.has("new")){const target=d.tasks.find(t=>t.id===params.get("task"));if(target)setEditing({...quoteFields,...target});else if(params.has("new"))setEditing({...blank});history.replaceState(null,"",location.pathname);}');contents=contents.replace(/href="\/(?!\/)([^"\n]*)"/g,(_,p)=>`href="${base}${app}/${p}${p&&!p.includes('#')&&!p.endsWith('/')?'/':''}"`);contents=contents.replace("href={'/forms/'+type}",`href={'${base}${app}/forms/'+type+'/'}`);return{contents:locale(links(toolPresentation(contents))),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'js'};});}}]});
 const dir=out+'/'+app+'/'+route;await mkdir(dir,{recursive:true});
 const title=app==='inventory'?'AITS Inventory':'AITS Project Board';
 await writeFile(dir+'/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${base}assets/${id}.css"></head><body><div id="app"></div><script type="module" src="${base}assets/${id}.js"></script></body></html>`,app));
}
await writeFile(out+'/.nojekyll','');
await mkdir(out+'/privacy',{recursive:true});
await cp('web/privacy.html',out+'/privacy/index.html');
await writeFile(out+'/404.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Page not found · AITS</title></head><body><h1>Page not found</h1><a href="${base}">Return to AITS Workplace</a></body></html>`,'workplace'));
console.log('Built all four interfaces and seven React routes at '+base);

await build({entryPoints:['web/line.tsx'],outfile:out+'/assets/line.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/project-board/line',{recursive:true});
await writeFile(out+'/project-board/line/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AITS LINE Conversations</title><link rel="stylesheet" href="${base}assets/line.css"></head><body><div id="app"></div><script type="module" src="${base}assets/line.js"></script></body></html>`,'project-board'));

await build({entryPoints:['web/dashboard.tsx'],outfile:out+'/assets/dashboard.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await writeFile(out+'/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f4ef"><title>AITS Workspace</title></head><body><div id="app"></div><script type="module" src="${base}assets/dashboard.js"></script></body></html>`,'workplace'));

await build({entryPoints:['web/review.tsx'],outfile:out+'/assets/review.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/project-board/review',{recursive:true});
await writeFile(out+'/project-board/review/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AITS Review Queue</title></head><body><div id="app"></div><script type="module" src="${base}assets/review.js"></script></body></html>`,'project-board'));

// Independent Studio routes use the shared shell, retaining their established engines.
await cp('web/studios.css',out+'/studios.css');
await cp('studios/floorplan/static',out+'/floorplan-studio/static',{recursive:true});
for(const name of ['index.html','app.js','browser-preview.js','service-connection.js','drawing-pack.js','site-photos.js']){
 const target=out+'/floorplan-studio/static/'+name;
 let source=await readFile(target,'utf8');source=source.replaceAll('/static/',base+'floorplan-studio/static/');await writeFile(target,source);
}
let floor=await readFile(out+'/floorplan-studio/static/index.html','utf8');
floor=floor.replace('<div class="shell">','<div class="shell" data-no-translate>');
floor=floor.replace('Plan it before you install it.','Floorplan Studio').replace('<p class="intro-copy">Upload a floor plan, describe the site, and build a clear first-pass device layout.</p>','');
floor=inject(floor,'floorplan-studio').replace('</head>','<link rel="stylesheet" href="'+base+'studios.css?v='+assetVersion+'"></head>');
await writeFile(out+'/floorplan-studio/index.html',floor);
await build({entryPoints:['web/content.tsx'],outfile:out+'/assets/content.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/content-studio',{recursive:true});
await writeFile(out+'/content-studio/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AITS Content Studio</title><link rel="stylesheet" href="${base}assets/content.css"></head><body><div id="app"></div><script type="module" src="${base}assets/content.js"></script></body></html>`,'content-studio').replace('</head>','<link rel="stylesheet" href="'+base+'studios.css?v='+assetVersion+'"></head>'));

await build({entryPoints:['web/admin.tsx'],outfile:out+'/assets/admin.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/admin',{recursive:true});
await writeFile(out+'/admin/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access · AITS</title><link rel="stylesheet" href="${base}assets/admin.css"></head><body><div id="app"></div><script type="module" src="${base}assets/admin.js"></script></body></html>`,'workplace'));

// Load the shared tool treatment last, after each independent tool stylesheet.
await cp('web/tools.css',out+'/tools.css');
await cp('web/brand',out+'/brand',{recursive:true});
await cp('web/brand.css',out+'/brand.css');
async function finishToolStyles(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await finishToolStyles(file);else if(entry.name.endsWith('.html')){const html=await readFile(file,'utf8');await writeFile(file,html.replace('</head>','<link rel="stylesheet" href="'+base+'tools.css?v='+assetVersion+'"><link rel="stylesheet" href="'+base+'brand.css?v='+assetVersion+'"><link rel="icon" type="image/svg+xml" href="'+base+'brand/aits-icon.svg?v='+assetVersion+'"></head>'));}}}
await finishToolStyles(out);
await build({entryPoints:['web/assistant-export.ts'],outfile:out+'/assets/assistant-export.js',bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022'});

await build({entryPoints:['web/assistant-page.tsx'],outfile:out+'/assets/assistant-page.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/assistant',{recursive:true});
await writeFile(out+'/assistant/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AITS AI Assistant</title><link rel="icon" type="image/svg+xml" href="${base}brand/aits-icon.svg?v=${assetVersion}"><link rel="stylesheet" href="${base}tools.css?v=${assetVersion}"><link rel="stylesheet" href="${base}brand.css?v=${assetVersion}"><link rel="stylesheet" href="${base}assistant.css?v=${assetVersion}"></head><body><div id="app"></div><script type="module" src="${base}assets/assistant-page.js"></script></body></html>`,'workplace'));
await cp('web/assistant.css',out+'/assistant.css');

await mkdir(out+'/roles',{recursive:true});
await writeFile(out+'/roles/index.html',`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${base}admin/?tab=roles"><title>Access · AITS</title></head><body><a href="${base}admin/?tab=roles">Roles &amp; permissions</a><script>location.replace(${JSON.stringify(base+'admin/?tab=roles')})</script></body></html>`);

await build({entryPoints:['web/weeklybrief.tsx'],outfile:out+'/assets/weeklybrief.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/weeklybrief',{recursive:true});
await writeFile(out+'/weeklybrief/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WeeklyBrief AI · AITS</title><link rel="stylesheet" href="${base}assets/weeklybrief.css"></head><body><div id="app"></div><script type="module" src="${base}assets/weeklybrief.js"></script></body></html>`,'project-board'));

await build({entryPoints:['web/project-management.tsx'],outfile:out+'/assets/project-management.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/project-management',{recursive:true});
await writeFile(out+'/project-management/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Management · AITS</title><link rel="stylesheet" href="${base}assets/project-management.css"></head><body><div id="app"></div><script type="module" src="${base}assets/project-management.js"></script></body></html>`,'project-board'));
await cp('web/pm-guidance',out+'/project-management/guidance',{recursive:true});

await build({entryPoints:['web/messaging.tsx'],outfile:out+'/assets/messaging.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/messaging',{recursive:true});
await cp('web/chat-files-sw.js',out+'/messaging/files-sw.js');
await writeFile(out+'/messaging/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team Chat | AITS</title><link rel="stylesheet" href="${base}assets/messaging.css"></head><body><div id="app"></div><script type="module" src="${base}assets/messaging.js"></script></body></html>`,'project-board'));

await build({entryPoints:['web/navigation.tsx'],outfile:out+'/assets/navigation.js',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022'});
await mkdir(out+'/navigation',{recursive:true});
await writeFile(out+'/navigation/index.html',inject(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navigation · AITS</title><link rel="stylesheet" href="${base}assets/navigation.css"></head><body><div id="app"></div><script type="module" src="${base}assets/navigation.js"></script></body></html>`,'workplace'));
