import fs from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Provide the current bundle and output path');
let code = fs.readFileSync(input, 'utf8');
function replaceOnce(before, after) {
  if (code.split(before).length !== 2) throw Error('Live bundle changed; review patch anchor: ' + before.slice(0, 80));
  code = code.replace(before, after);
}
const helper = fs.readFileSync(new URL('../backend/content-studio-publishing-errors.mjs', import.meta.url),'utf8').replace('export function','function');
replaceOnce('throw new MetaError(response2.status >= 500);', 'throw Object.assign(new MetaError(response2.status >= 500), { publicMessage: studioPublishingError(result.error?.code) });');
const start = code.indexOf('async function publishContent(');
const freeze = code.indexOf('  const frozen = ', start);
if (start < 0 || freeze < 0) throw Error('Missing publishing preflight anchor');
code = code.slice(0, freeze) + `  if (selectedChannel === "facebook") {
    const connection = await checkStudioFacebook(e);
    if (!connection.ok) return json6({error: connection.reason === "TOKEN_EXPIRED_OR_INVALID" ? studioPublishingError(190) : connection.reason === "CHECK_UNAVAILABLE" ? 'ไม่สามารถตรวจสอบการเชื่อมต่อได้ กรุณารีเฟรชแล้วลองใหม่' : studioPublishingError(200), connection}, 409);
  }
` + code.slice(freeze);
const fallback = '"\\u0E04\\u0E33\\u0E02\\u0E2D\\u0E44\\u0E21\\u0E48\\u0E2A\\u0E33\\u0E40\\u0E23\\u0E47\\u0E08"';
replaceOnce(fallback, '(error48.publicMessage || studioPublishingError())');
fs.writeFileSync(output, helper + '\n' + code);
