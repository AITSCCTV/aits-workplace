import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkStudioFacebook} from '../content-studio-facebook-health.mjs';
const settings={FACEBOOK_PAGE_ID:'123',FACEBOOK_PAGE_TOKEN:'private-test-token',META_GRAPH_VERSION:'v27.0'};
test('checks the configured Page with a read-only request',async()=>{
  const result=await checkStudioFacebook(settings,async(url,options)=>{
    assert.equal(url,'https://graph.facebook.com/v27.0/me?fields=id');
    assert.equal(options.method,undefined); assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,'Bearer private-test-token');
    return Response.json({id:'123'});
  }); assert.equal(result.ok,true);
});
test('expired tokens are not connected and provider messages are not exposed',async()=>{
  const result=await checkStudioFacebook(settings,async()=>Response.json({error:{code:190,error_subcode:463,message:'private-test-token'}},{status:401}));
  assert.deepEqual(result,{ok:false,reason:'TOKEN_EXPIRED_OR_INVALID'});
});
test('rejects wrong Page, unavailable checks and missing configuration',async()=>{
  assert.equal((await checkStudioFacebook(settings,async()=>Response.json({id:'456'}))).reason,'WRONG_PAGE');
  assert.equal((await checkStudioFacebook(settings,async()=>{throw Error('offline');})).reason,'CHECK_UNAVAILABLE');
  assert.equal((await checkStudioFacebook({},async()=>{throw Error('must not call');})).reason,'NOT_CONFIGURED');
});
