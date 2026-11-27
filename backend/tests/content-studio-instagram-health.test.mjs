import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkStudioInstagram} from '../content-studio-instagram-health.mjs';
const settings={INSTAGRAM_ACCOUNT_ID:'123',INSTAGRAM_TOKEN:'private-test-token',META_GRAPH_VERSION:'v27.0'};
test('verifies Instagram identity and no scheduled expiry using only GET requests',async()=>{
 const result=await checkStudioInstagram(settings,async(url,options)=>{
  assert.equal(options.method,undefined);assert.equal(options.body,undefined);
  return Response.json(url.includes('/debug_token?')?{data:{is_valid:true,expires_at:0,data_access_expires_at:1803432298,scopes:['instagram_content_publish']}}:{id:'123',username:'aitscctv'});
 });
 assert.equal(result.ok,true);assert.equal(result.expiryStatus,'NO_SCHEDULED_EXPIRY');assert.equal(result.publishingPermission,true);
 assert.ok(!JSON.stringify(result).includes('private-test-token'));
});
test('expired credentials fail without exposing provider text',async()=>{
 const result=await checkStudioInstagram(settings,async()=>Response.json({error:{code:190,message:'private-test-token'}},{status:401}));
 assert.deepEqual(result,{ok:false,reason:'TOKEN_EXPIRED_OR_INVALID'});
});
test('missing publish permission fails and unavailable introspection is not called never-expiring',async()=>{
 const denied=await checkStudioInstagram(settings,async url=>Response.json(url.includes('/debug_token?')?{data:{expires_at:123,scopes:[]}}:{id:'123'}));
 assert.equal(denied.reason,'PUBLISHING_PERMISSION_MISSING');
 const unavailable=await checkStudioInstagram(settings,async url=>url.includes('/debug_token?')?Response.json({error:{}},{status:403}):Response.json({id:'123'}));
 assert.equal(unavailable.expiryStatus,'UNAVAILABLE');assert.equal(unavailable.ok,true);
});
