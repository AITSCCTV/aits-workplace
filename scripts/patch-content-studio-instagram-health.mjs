import fs from 'node:fs';
const [input,output]=process.argv.slice(2);
let code=fs.readFileSync(input,'utf8');
const helper=fs.readFileSync(new URL('../backend/content-studio-instagram-health.mjs',import.meta.url),'utf8').replace('export async function','async function');
const anchor='      const facebookConnection = await checkStudioFacebook(settings);';
const ready='        instagramReady: !!(settings.INSTAGRAM_ACCOUNT_ID && settings.INSTAGRAM_TOKEN && settings.N8N_MEDIA_BASE_URL && versionReady && env2.CONTENT_STUDIO_BUCKET),';
for(const text of [anchor,ready]) if(code.split(text).length!==2)throw Error('Live bundle changed; review anchors');
code=code.replace(anchor,anchor+'\n      const instagramConnection = await checkStudioInstagram(settings);').replace(ready,'        instagramConnection,\n        instagramReady: instagramConnection.ok && !!(settings.N8N_MEDIA_BASE_URL && env2.CONTENT_STUDIO_BUCKET),');
fs.writeFileSync(output,helper+'\n'+code);
