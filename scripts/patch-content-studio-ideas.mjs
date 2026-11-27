import fs from 'node:fs';
const [input,output]=process.argv.slice(2);
let code=fs.readFileSync(input,'utf8');
function replaceOnce(from,to){if(code.split(from).length!==2)throw Error('Shared Worker anchor changed: '+from.slice(0,70));code=code.replace(from,to);}
const helper=fs.readFileSync(new URL('../backend/content-studio-ideas.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
replaceOnce('    if (path === "/research" && request2.method === "POST") {',`    if (path === "/ideas" && request2.method === "POST") {
      const result = await createStudioIdea(await readStudioJson(request2, 20000), env2, user.email || user.id);
      return json6(result.body, result.status);
    }
    if (path === "/research" && request2.method === "POST") {`);
replaceOnce('    return json6({ researchId: id, job: "DAILY" });',`    const saved = await env2.DB.prepare("SELECT payload FROM content_studio_runs WHERE id=?").bind(id).first();
    const job = JSON.parse(saved.payload);
    return json6({ researchId: id, job: "DAILY", ...(id.startsWith("manual_idea_") ? {ideaPrompt: job.ideaPrompt, editorialStyle: job.editorialStyle} : {}) });`);
// Keep scheduled-slot throttling independent of one-time requests.
code=code.replaceAll("WHERE id LIKE 'manual_%' AND COALESCE", "WHERE id LIKE 'manual_%' AND id NOT LIKE 'manual_idea_%' AND COALESCE");
replaceOnce('      return json6({ id, stage, added });',`      if (id.startsWith("manual_idea_") && ["COMPLETE", "EMPTY", "TIMED_OUT"].includes(stage)) await env2.DB.prepare("UPDATE content_studio_runs SET payload=json_set(payload,'$.stage',?) WHERE id=?").bind(stage, id).run();
      const details = report ? JSON.parse(report.payload) : null;
      return json6({ id, stage, added, draftIds: (details?.cards || []).slice(0,1).map(c=>c.contentId), reason: stage === "EMPTY" ? details?.coverageNotesTH || "" : "" });`);
fs.writeFileSync(output,helper+'\n'+code);
