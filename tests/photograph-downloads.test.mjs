import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotographDownloads } from '../assets/photograph-downloads.js';
const work = 'tlaw-0123456789abcdef';
const source = 'a'.repeat(64);
const front = Object.freeze({workId: work, sourcePhotographSha256: source, displayUrl: 'small.jpg'});
const index = {byWork:{[work]:front},byRecord:{'tla-record':front},unselectedWorkIds:[]};
function manifest() { return {media_revision:'b'.repeat(40),rows:[{work_id:work,source_sha256:source,path:`Physical_References/Photographs/Selected_Front_Downloads/images/${work}/IMG_1.jpg`,sha256:'c'.repeat(64),width_px:6048,height_px:8064,size_bytes:12000000,resolution_class:'native_resolution_jpeg'}]}; }
test('downloads use a pinned HF revision and preserve small display URLs',()=>{
 const result=attachPhotographDownloads(index,manifest());
 assert.equal(result.byWork[work].displayUrl,'small.jpg');
 assert.match(result.byWork[work].downloadUrl,/resolve\/b{40}\/Physical_References/);
 assert.equal(result.byRecord['tla-record'],result.byWork[work]);
 assert.equal(result.byWork[work].downloadLabel,'Download full-resolution JPEG');
 assert.equal(front.downloadUrl,undefined);
});
test('rejects a different source for the same work',()=>{
 const m=manifest();m.rows[0].source_sha256='d'.repeat(64);
 assert.throws(()=>attachPhotographDownloads(index,m));
});
test('rejects paths outside the photograph collection and traversal',()=>{
 for(const path of ['https://example.com/x.jpg','Physical_References/Photographs/../secret.jpg']) {
  const m=manifest();m.rows[0].path=path;assert.throws(()=>attachPhotographDownloads(index,m));
 }
});
test('limited sources are labeled accurately and missing sources have no download',()=>{
 const m=manifest();m.rows[0].resolution_class='limited_resolution_jpeg';
 assert.equal(attachPhotographDownloads(index,m).byWork[work].downloadLabel,'Download available JPEG (limited resolution)');
 m.rows[0].path=null;m.rows[0].resolution_class='source_not_located';
 assert.equal(attachPhotographDownloads(index,m).byWork[work].downloadUrl,undefined);
});
