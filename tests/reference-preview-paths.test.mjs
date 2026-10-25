import test from 'node:test';
import assert from 'node:assert/strict';
import {referencePreviewPath, SHARED_REFERENCE_PREVIEWS} from '../assets/reference-preview-paths.js';

test('an exact-byte historical preview reuses the surviving selected-front path',()=>{
 assert.equal(referencePreviewPath('7a00fa45143e592678587da5c4807d56b785f3998bc890674a40dcf1b3dcac8d'),
  'selected-fronts/tlaw-858a03eb138fbf47.jpg');
 assert.equal(Object.keys(SHARED_REFERENCE_PREVIEWS).length,38);
 assert.equal(referencePreviewPath('0'.repeat(64)),`reference-previews/${'0'.repeat(64)}.jpg`);
});
test('preview paths reject traversal, remote URLs and malformed source hashes',()=>{
 for(const source of ['../secret','https://example.com/a.jpg','a'.repeat(63),'A'.repeat(64),null]) {
  assert.throws(()=>referencePreviewPath(source),/source hash/);
 }
 assert.ok(Object.values(SHARED_REFERENCE_PREVIEWS).every(path=>/^selected-fronts\/tlaw-[a-f0-9]{16}\.jpg$/.test(path)));
});
