import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioPublishingError} from '../content-studio-publishing-errors.mjs';
test('distinguishes expired access, permissions, rate limits and bad input',()=>{
  assert.match(studioPublishingError(190), /หมดอายุ/);
  assert.match(studioPublishingError(200), /สิทธิ์/);
  assert.equal(studioPublishingError(10), studioPublishingError(200));
  assert.match(studioPublishingError(613), /จำกัด/);
  assert.match(studioPublishingError(100), /ข้อมูลโพสต์/);
});
test('unknown provider data never becomes a public error',()=>{
  assert.equal(studioPublishingError('secret-token'),studioPublishingError());
  assert.doesNotMatch(studioPublishingError({message:'secret-token'}), /secret-token/);
});
