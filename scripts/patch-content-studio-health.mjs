import fs from 'node:fs';
// Patch the currently deployed shared Worker bundle, preserving unrelated code.
// Authentication, bindings, and deployment are deliberately handled separately.
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/patch-content-studio-health.mjs INPUT OUTPUT');
let code=fs.readFileSync(input,'utf8');
const helper=fs.readFileSync(new URL('../backend/content-studio-facebook-health.mjs',import.meta.url),'utf8').replace('export async function','async function');
const before='        facebookReady: !!(settings.FACEBOOK_PAGE_ID && settings.FACEBOOK_PAGE_TOKEN && versionReady && env2.CONTENT_STUDIO_BUCKET),';
const anchor='      const versionReady = /^v\\d+\\.\\d+$/.test(settings.META_GRAPH_VERSION);';
for(const needle of [before,anchor])if(code.split(needle).length!==2)throw Error('Live bundle changed; review before patching.');
code=helper+'\n'+code.replace(anchor,anchor+'\n      const facebookConnection = await checkStudioFacebook(settings);').replace(before,'        facebookConnection,\n        facebookReady: facebookConnection.ok && !!env2.CONTENT_STUDIO_BUCKET,');
fs.writeFileSync(output,code);
