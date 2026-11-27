import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path=process.env.STUDIO_TEST_BUNDLE;
test('patched publisher stops invalid access before claiming a draft or uploading', {skip:!path}, async()=>{
 const source=fs.readFileSync(path,'utf8');
 const publish=source.slice(source.indexOf('async function publishContent('),source.indexOf('__name(publishContent,'));
 let reads=0;
 const context=vm.createContext({
  __name:x=>x,studioBucket:()=>({get(){throw Error('must not upload');}}),
  studioSettings:()=>({POSTING_ENABLED:'true',FACEBOOK_PAGE_ID:'123',FACEBOOK_PAGE_TOKEN:'test',META_GRAPH_VERSION:'v27.0'}),
  readStudioJson:async()=>({channel:'facebook',id:'draft',revision:1,checked:true}),
  studioId:{parse:x=>x}, external_exports3:{number:()=>({int:()=>({positive:()=>({parse:x=>x})})})},
  validateDraft:x=>x,checkStudioFacebook:async()=>({ok:false,reason:'TOKEN_EXPIRED_OR_INVALID'}),studioPublishingError:()=> 'Reconnect Facebook',
 });
 vm.runInContext(publish,context);
 const result=await context.publishContent({}, {CONTENT_STUDIO_BUCKET:{},DB:{prepare(sql){
  assert.equal(sql,'SELECT * FROM content_studio_drafts WHERE id=?'); reads++;
  return {bind:()=>({first:async()=>({revision:1,payload:JSON.stringify({images:['image.jpg']})})})};
 }}},{},(body,status)=>({body,status}));
 assert.equal(result.status,409);assert.equal(reads,1);assert.equal(result.body.error,'Reconnect Facebook');
});
