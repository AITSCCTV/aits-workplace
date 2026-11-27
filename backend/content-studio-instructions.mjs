export const instructionKeys = ['research', 'monday', 'thursday', 'writing'];
export const instructionDefaults = {
  research: 'Research useful topics for Thai customers that relate to verified AITS CCTV, smart-home, networking and access-control services. Use original AITS pages and primary manufacturer or standards documentation. Explain how AITS can help rather than just repeating news. Trends are optional relevant context. Avoid repeating previous topics; never invent facts, prices, rankings or capabilities.',
  monday: 'Teach one technical smart-home, device or networking concept in plain Thai. Explain how it works, practical uses, limitations and compatibility. Examples: Wi-Fi 5 versus 5 GHz, interference, Zigbee, Matter, sensors and PoE. Prioritize learning and finish with a gentle LINE consultation CTA.',
  thursday: 'Help Thai customers choose CCTV, smart-home, networking or access-control solutions. Use fair comparisons, buying guides and verified AITS benefits. Compare brands using explicit criteria and current official sources. Do not claim top-selling rankings or AITS brand support without evidence. Prefer a narrower useful guide when evidence is limited.',
  writing: 'Write in natural professional Thai with helpful English technical terms. Be knowledgeable, friendly, honest and practical. Start with a customer problem and answer directly. Use short paragraphs, useful technical explanations and checklists. Aim for roughly 60% education, 25% practical guidance and 15% brand content. Create distinct Facebook and Instagram captions, 3–5 relevant hashtags including #AITSCCTV, and a gentle LINE CTA. Keep Instagram within 2,200 characters. Include a useful Thai SEO article, title, slug, meta description and relevant verified links. Avoid hype, jargon, repeated brand mentions and invented search volumes.'
};
export function validateInstructions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== instructionKeys.length || Object.keys(value).some(k => !instructionKeys.includes(k))) throw new Error('Only the four editorial instruction fields can be changed.');
  const result = {};
  for (const key of instructionKeys) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 6000) throw new Error('Each instruction must contain 1–6,000 characters.');
    result[key] = value[key].trim();
  }
  return result;
}
export async function readStudioInstructions(db, history = false) {
  const row = await db.prepare('SELECT revision,instructions,updated_at,updated_by FROM content_studio_instruction_versions ORDER BY revision DESC LIMIT 1').first();
  const current = row ? {revision: row.revision, instructions: validateInstructions(JSON.parse(row.instructions)), updatedAt: row.updated_at, updatedBy: row.updated_by} : {revision: 0, instructions: {...instructionDefaults}, updatedAt: null, updatedBy: null};
  if (history) {
    current.history = (await db.prepare('SELECT revision,instructions,updated_at,updated_by FROM content_studio_instruction_versions ORDER BY revision DESC LIMIT 20').all()).results.map(r => ({revision:r.revision,instructions:JSON.parse(r.instructions),updatedAt:r.updated_at,updatedBy:r.updated_by}));
    if(current.history.length<20)current.history.push({revision:0,instructions:{...instructionDefaults},updatedAt:null,updatedBy:'AITS baseline'});
  }
  return current;
}
export async function saveStudioInstructions(db, input, actor) {
  if (!input || Object.keys(input).some(k => !['revision','instructions'].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision < 0) return Response.json({error:'Invalid instruction update.'},{status:400});
  let instructions;
  try { instructions = validateInstructions(input.instructions); } catch (e) { return Response.json({error:e.message},{status:400}); }
  const result = await db.prepare('INSERT INTO content_studio_instruction_versions(revision,instructions,updated_at,updated_by) SELECT ?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM content_studio_instruction_versions),0)=? ON CONFLICT(revision) DO NOTHING').bind(input.revision+1,JSON.stringify(instructions),new Date().toISOString(),actor,input.revision).run();
  if (result.meta.changes !== 1) return Response.json({error:'Another person saved changes. Reload before saving your version.'},{status:409});
  return Response.json(await readStudioInstructions(db,true));
}
