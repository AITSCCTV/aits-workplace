// Credentials arrive only over hidden stdin. Never save or print them.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve('private-data/sites-source');await mkdir(folder,{recursive:true});
if(!process.stdin.isTTY)throw Error('Use a terminal with hidden input.');
process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write('Ready for private export credentials on hidden stdin.\n');
const input=await new Promise((resolve,reject)=>{let data='';const read=chunk=>{data+=chunk.toString();if(data.includes('\u0003'))reject(Error('Cancelled'));if(/[\r\n]/.test(data)){process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();resolve(data.trim());}};process.stdin.on('data',read);});
const {sites}=JSON.parse(input),summary=[];
for(const site of sites){
 if(!['inventory','project-board','design-studio'].includes(site.name))throw Error('Unknown source');
 const base=new URL(site.url);if(!base.hostname.endsWith('.aitscctv.chatgpt.site')||base.protocol!=='https:')throw Error('Unexpected source host');
 const read=async route=>{const r=await fetch(new URL(route,base),{headers:{'OAI-Sites-Authorization':site.token},redirect:'error'});if(!r.ok)throw Error('Source HTTP '+r.status);return r.json();};
 const routes=site.name==='inventory'?['stock']:site.name==='design-studio'?['plans']:['tasks','projects','service','warranties','calendar'];
 for(const route of routes){try{
  const data=await read('/api/'+route);await writeFile(path.join(folder,site.name+'-'+route+'.json'),JSON.stringify(data,null,2));
  summary.push({site:site.name,route,status:'exported',count:(data.tasks||data.projects||data.records||data.warranties||data.events||data.items||data.plans||[]).length});
  if(route==='plans')for(const plan of data.plans){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(plan.id))throw Error("Invalid plan ID");const saved=await read('/api/plans/'+encodeURIComponent(plan.id));await writeFile(path.join(folder,'plan-'+plan.id+'.json'),JSON.stringify(saved));}
  if(route==='projects')for(const project of data.projects){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(project.id))throw Error("Invalid project ID");const saved=await read('/api/projects?history='+encodeURIComponent(project.id));await writeFile(path.join(folder,'project-history-'+project.id+'.json'),JSON.stringify(saved));}
 }catch(e){summary.push({site:site.name,route,status:'failed',reason:e.message.startsWith('Source HTTP')?e.message:'Source export unavailable'});}}
}
await writeFile(path.join(folder,'export-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
