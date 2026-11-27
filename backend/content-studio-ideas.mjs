export async function createStudioIdea(input, env, actor, fetcher = fetch) {
 const reply=(body,status)=>({body,status});
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['prompt','style','requestId'].includes(k))||typeof input.prompt!=='string'||input.prompt.trim().length<10||input.prompt.length>4000||!['EDUCATIONAL','MARKETING'].includes(input.style)||! /^[a-f0-9]{32}$/.test(input.requestId||''))return reply({error:'Enter an idea between 10 and 4,000 characters and choose a content style.'},400);
 const webhook=env.CONTENT_STUDIO_RESEARCH_WEBHOOK;
 if(!webhook||!/^https:\/\/aitscctv\.app\.n8n\.cloud\/webhook\/[^?#]+$/.test(webhook))return reply({error:'Idea generation is not configured.'},503);
 const id='manual_idea_'+input.requestId, prompt=input.prompt.trim(), now=new Date().toISOString();
 const existing=await env.DB.prepare('SELECT payload FROM content_studio_runs WHERE id=?').bind(id).first();
 if(existing){const job=JSON.parse(existing.payload);return job.requestedBy===actor&&job.ideaPrompt===prompt&&job.editorialStyle===input.style?reply({id},202):reply({error:'Request ID already used. Start a new idea.'},409);}
 const job={id,generatedAt:now,stage:'QUEUED',ideaPrompt:prompt,editorialStyle:input.style,requestedBy:actor};
 const inserted=await env.DB.prepare("INSERT INTO content_studio_runs(id,payload,recorded_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM content_studio_runs WHERE id LIKE 'manual_idea_%' AND json_extract(payload,'$.requestedBy')=? AND json_extract(payload,'$.stage') IN ('QUEUED','RESEARCHING') AND recorded_at>?) ON CONFLICT(id) DO NOTHING").bind(id,JSON.stringify(job),now,actor,new Date(Date.now()-30*60*1000).toISOString()).run();
 if(inserted.meta.changes!==1){const same=await env.DB.prepare('SELECT payload FROM content_studio_runs WHERE id=?').bind(id).first();if(same){const j=JSON.parse(same.payload);if(j.requestedBy===actor&&j.ideaPrompt===prompt&&j.editorialStyle===input.style)return reply({id},202);}return reply({error:'Your previous idea is still being generated. Wait for it to finish before starting another.'},429);}
 try{
  const response=await fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({researchId:id}),signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!response.ok)throw Error('Trigger failed');
  await response.body?.cancel();
 }catch{
  // A timed-out trigger may already be running. Only mark an unclaimed job failed.
  const changed=await env.DB.prepare("UPDATE content_studio_runs SET payload=json_set(payload,'$.stage','FAILED') WHERE id=? AND json_extract(payload,'$.stage')='QUEUED'").bind(id).run();
  if(changed.meta.changes===1)return reply({error:'Generation could not start. Please try again.'},502);
 }
 return reply({id},202);
}
