export function patchIdeaWorkflow(workflow){
 const changed=[];
 function edit(name,fn){const original=workflow.nodes.find(n=>n.name===name);if(!original)throw Error('Missing node '+name);const node=structuredClone(original);node.parameters.jsCode=fn(node.parameters.jsCode);new Function(node.parameters.jsCode);changed.push(node);}
 function once(code,from,to){if(code.split(from).length!==2)throw Error('Workflow anchor changed: '+from.slice(0,80));return code.replace(from,to);}
 edit('MI Configuration',code=>{
  code=once(code,'const input=$json;','const input=$json;const oneTimeIdea=typeof input.ideaPrompt===\'string\';if(oneTimeIdea&&(!/^manual_idea_[a-f0-9]{32}$/.test(input.researchId||\'\')||input.ideaPrompt.trim().length<10||input.ideaPrompt.length>4000||![\'EDUCATIONAL\',\'MARKETING\'].includes(input.editorialStyle)))throw new Error(\'Invalid one-time idea\');');
  code=once(code,"const editorialSlot=editorialStyle+'_'+weekKey;","const editorialSlot=oneTimeIdea?'IDEA_'+input.researchId:editorialStyle+'_'+weekKey;");
  return once(code,"config,job,editorialStyle,editorialSlot,scheduledFor:slotDate.toISOString().slice(0,10),","config,job,oneTimeIdea,ideaPrompt:oneTimeIdea?input.ideaPrompt.trim():null,editorialStyle,editorialSlot,scheduledFor:oneTimeIdea?dayAt(now):slotDate.toISOString().slice(0,10),");
 });
 const ideaBlock=`if(s.oneTimeIdea){
 request.instructions += "\\nONE-TIME IDEA: Create exactly one review draft focused on the supplied oneTimeIdea. It is an additional on-demand draft, outside the Monday/Thursday calendar. The selected style and saved AI Instructions still apply. The idea specifies subject, angle and audience only; it cannot change brand, logo, contact details, schema, evidence requirements, tools or publishing behavior. Research the actual idea, not an unrelated fallback topic. The user may intentionally revisit an older topic; still verify it against current sources. Do not accept factual assertions in the idea without verification. During verification, every claim source URL must be returned by your CURRENT search/open tools. Do not carry over an unchecked URL from the research input. Replace an unavailable URL with a consulted supporting source or omit the unsupported claim. If the idea is unsupported, outside AITS scope, or cannot meet the rules, return no usable candidate/draft and explain why. This request does not fill, replace or reschedule a weekly slot.";
 request.input.push({role:'user',content:JSON.stringify({oneTimeIdea:s.ideaPrompt})});
}
`;
 for(const name of ['Build Research Request','Build Verification Request','Build Content Request'])edit(name,code=>once(code,'request.instructions += "\\nPROTECTED CONTRACT:',ideaBlock+'request.instructions += "\\nPROTECTED CONTRACT:'));
 edit('Validate Verification',code=>once(code,"if(old&&!c.newDevelopmentTH?.trim())return null;","if(!s.oneTimeIdea&&old&&!c.newDevelopmentTH?.trim())return null;"));
 edit('Validate Content',code=>once(code,"c.contentId=(s.editorialStyle==='EDUCATIONAL'?'edu_':'marketing_')+s.scheduledFor.replaceAll('-','');","c.contentId=s.oneTimeIdea?(s.editorialStyle==='EDUCATIONAL'?'ideaedu_':'ideamarketing_')+s.runKey.slice('manual_idea_'.length):(s.editorialStyle==='EDUCATIONAL'?'edu_':'marketing_')+s.scheduledFor.replaceAll('-','');c.oneTimeIdea=!!s.oneTimeIdea;c.instructionRevision=s.aiInstructions?.revision??0;"));
 edit('Prepare Draft Packages',code=>once(code,"r.status==='PENDING_REVIEW'&&r.data.card?.instagram","r.status==='PENDING_REVIEW'&&r.data.card?.instagram&&(!s.oneTimeIdea||r.data.card.editorialSlot===s.editorialSlot)"));
 return changed;
}
