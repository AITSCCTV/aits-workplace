import fs from 'node:fs';
const [input,output]=process.argv.slice(2);
let code=fs.readFileSync(input,'utf8');
const helper=fs.readFileSync(new URL('../backend/content-studio-instructions.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const anchor='  const input = await readStudioJson(request2, 24 * 1024 * 1024);';
if(code.split(anchor).length!==2)throw Error('Shared Worker changed; review before patching.');
code=code.replace(anchor,anchor+'\n  if (input?.instructionsRead === true) return json6(await readStudioInstructions(env2.DB));');
fs.writeFileSync(output,helper+'\n'+code);
