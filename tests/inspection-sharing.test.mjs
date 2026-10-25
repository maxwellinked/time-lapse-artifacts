import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','inspection');
const sharedPath=path.join(root,'shared_location.js');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const saved=require(path.join(root,'saved_location.js'));
const fragment=text=>'#view='+encodeURIComponent(text);
const required=['source_repository','source_revision','work_id','record_id','source_sha256','pts','time_base','encoded_seconds','browser_seek_seconds','png_sha256','source_url','time_scope','presentation_rotation_ccw_degrees','presentation_rotation_scope'];

function codec(){
 assert.ok(fs.existsSync(sharedPath),'The bounded exact-view fragment codec must be implemented.');
 return require(sharedPath);
}
function location(caseIndex=1,recordIndex=1,frameIndex=4,rotation=90,source=manifest){
 const c=source.cases[caseIndex],r=c.records[recordIndex],f=r.frames[frameIndex];
 return {schema:'tla-inspection-location/v1',source_repository:source.source_repository,source_revision:source.source_revision,
  work_id:c.work_id,record_id:r.record_id,source_sha256:r.source_sha256,pts:f.pts,time_base:f.time_base,
  encoded_seconds:f.pts_time_seconds,browser_seek_seconds:f.browser_seek_seconds,png_sha256:f.png_sha256,
  source_url:f.source_passage_url,time_scope:'encoded presentation time, not physical drawing time',
  presentation_rotation_ccw_degrees:rotation,presentation_rotation_scope:'selected-frame viewport only; no source-orientation assertion'};
}

test('all 324 sample and rotation combinations retain exact identities in fragment-only links',()=>{
 const api=codec();let count=0;
 manifest.cases.forEach((c,ci)=>c.records.forEach((r,ri)=>r.frames.forEach((f,fi)=>{
  for(const rotation of [0,90,180,270]){
   const hash=api.createFragment(manifest,ci,ri,fi,rotation);
   assert.ok(hash.startsWith('#view='));assert.ok(hash.length<=16384);
   const url=new URL(hash,'https://inspection.example/inspection/');
   assert.equal(url.search,'');assert.equal(url.hash,hash);
   const text=api.parseFragment(hash,manifest);
   assert.equal(hash,fragment(text));
   assert.deepEqual(JSON.parse(text),location(ci,ri,fi,rotation));
   const target=saved.parseSavedLocation(text,manifest);
   assert.equal(target.caseIndex,ci);assert.equal(target.recordIndex,ri);assert.equal(target.frameIndex,fi);assert.equal(target.rotation,rotation);
   count++;
  }
 })));
 assert.equal(count,324);
});

test('parsing preserves the exact supplied JSON text and all its fields',()=>{
 const api=codec(),value=location();
 const text='\ufeff'+JSON.stringify(Object.fromEntries(Object.entries(value).reverse()),null,2)+'\n';
 assert.equal(api.parseFragment(fragment(text),manifest),text);
 assert.deepEqual(saved.parseSavedLocation(text,manifest),{caseIndex:1,recordIndex:1,frameIndex:4,rotation:90});
});

test('an existing schema-optional saved location is preserved without reconstructing fields',()=>{
 const api=codec(),value=location();delete value.schema;
 const text=JSON.stringify(value,null,2);
 const decoded=api.parseFragment(fragment(text),manifest);
 assert.equal(decoded,text);assert.equal(Object.hasOwn(JSON.parse(decoded),'schema'),false);
});

test('every required binding field must be supplied even when the manifest could fill it in',()=>{
 const api=codec();
 for(const key of required){
  const value=location();delete value[key];
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify(value)),manifest),/incomplete/,key);
 }
});

test('every altered binding fails rather than substituting a sample or recording',()=>{
 const api=codec(),good=location();
 const mutations={source_repository:'https://invalid.example/repository',source_revision:'f'.repeat(40),work_id:'unknown-work',
  record_id:'unknown-record',source_sha256:'f'.repeat(64),pts:good.pts+1,time_base:'1/999999',
  encoded_seconds:good.encoded_seconds+0.125,browser_seek_seconds:good.browser_seek_seconds+0.125,png_sha256:'f'.repeat(64),
  source_url:'https://invalid.example/injected.png',time_scope:'physical drawing time',
  presentation_rotation_ccw_degrees:45,presentation_rotation_scope:'source orientation'};
 for(const [key,value] of Object.entries(mutations)){
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify({...good,[key]:value})),manifest),undefined,key);
 }
});

test('links from a different loaded source revision cannot be restored',()=>{
 const api=codec(),hash=fragment(JSON.stringify(location()));
 const changed=structuredClone(manifest);changed.source_revision='e'.repeat(40);
 assert.throws(()=>api.parseFragment(hash,changed),/revision/);
});

test('unsupported versions and extra fields including image URLs and autoplay are rejected',()=>{
 const api=codec(),good=location();
 for(const schema of ['tla-inspection-location/v2','',null,1]){
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify({...good,schema})),manifest),/version/);
 }
 for(const key of ['image_url','png','url','autoplay','caseIndex','frameIndex','zoom','__proto__']){
  const value={...good,[key]:'https://invalid.example/injected.png'};
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify(value)),manifest),/unsupported field/,key);
 }
});

test('invalid timestamps, rotations and non-object JSON cannot become defaults',()=>{
 const api=codec(),good=location();
 for(const pts of [-1,1.5,String(good.pts),null,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify({...good,pts})),manifest));
 }
 for(const rotation of [-90,360,'90',null]){
  assert.throws(()=>api.parseFragment(fragment(JSON.stringify({...good,presentation_rotation_ccw_degrees:rotation})),manifest));
 }
 for(const text of ['null','[]','{}','0','"saved location"','false']){
  assert.throws(()=>api.parseFragment(fragment(text),manifest));
 }
});

test('only the exact nonempty #view= fragment form is accepted',()=>{
 const api=codec(),hash=fragment(JSON.stringify(location())),payload=hash.slice(6);
 for(const input of [undefined,null,0,{},'', '#', '#view=', 'view='+payload,'#VIEW='+payload,'#view?'+payload,'?view='+payload,'https://inspection.example/'+hash,' #view='+payload]){
  assert.throws(()=>api.parseFragment(input,manifest),undefined,String(input));
 }
});

test('unencoded, malformed, noncanonical and truncated payloads are rejected',()=>{
 const api=codec(),text=JSON.stringify(location()),hash=fragment(text);
 const invalid=['#view='+text,'#view=%','#view=%2','#view=%GG','#view=%C0%AF','#view=%ED%A0%80',
  hash.replace('%7B','%7b'),hash.replace('%22','"'),hash.replace('schema','%73chema'),
  hash.slice(0,-1),hash.slice(0,-3),fragment(text.slice(0,-1)),
  '#view='+encodeURIComponent(encodeURIComponent(text)),fragment(text)+'+',fragment(text)+'%20 '];
 for(const input of invalid)assert.throws(()=>api.parseFragment(input,manifest),undefined,input.slice(0,70));
});

test('duplicate view fields and appended query fields cannot select another payload',()=>{
 const api=codec(),hash=fragment(JSON.stringify(location())),other=fragment(JSON.stringify(location(0,0,0,270)));
 for(const input of [hash+'&view='+other.slice(6),hash+other,hash+'&image_url=https://invalid.example/x.png',
  hash+'?view='+other.slice(6),hash+'%26view%3D'+other.slice(6),'#view='+hash]){
  assert.throws(()=>api.parseFragment(input,manifest));
 }
});

test('the complete canonical fragment has a 16,384-character bound',()=>{
 const api=codec(),text=JSON.stringify(location()),hash=fragment(text);
 assert.equal(api.MAX_HASH_LENGTH,16384);
 const padding=Math.floor((16384-hash.length)/3),within=text+' '.repeat(padding);
 assert.ok(fragment(within).length<=16384);assert.ok(fragment(within).length>16381);
 assert.equal(api.parseFragment(fragment(within),manifest),within);
 const oversized=fragment(within+' ');assert.ok(oversized.length>16384);
 assert.throws(()=>api.parseFragment(oversized,manifest),/limit|exceed|long/i);
});

test('creation caps the encoded fragment even when the JSON text is smaller',()=>{
 const api=codec(),large=structuredClone(manifest);
 large.source_repository='https://fixture.example/'+'é'.repeat(3000);
 const text=JSON.stringify(location(0,0,0,0,large));
 assert.ok(text.length<16384);assert.ok(fragment(text).length>16384);
 assert.deepEqual(saved.parseSavedLocation(text,large),{caseIndex:0,recordIndex:0,frameIndex:0,rotation:0});
 assert.throws(()=>api.createFragment(large,0,0,0,0),/limit|exceed|long/i);
});

test('creation validates indexes, rotation and full saved-location identity',()=>{
 const api=codec();
 for(const indexes of [[-1,0,0],[0,-1,0],[0,0,-1],[0,0,1.5],[999,0,0],[0,999,0],[0,0,999]]){
  assert.throws(()=>api.createFragment(manifest,...indexes,0));
 }
 for(const rotation of [undefined,null,'90',45,360])assert.throws(()=>api.createFragment(manifest,0,0,0,rotation));
 const malformed=structuredClone(manifest);malformed.cases[0].records[0].source_sha256='not-a-source-hash';
 assert.throws(()=>api.createFragment(malformed,0,0,0,0),/hash/);
 const mismatched=structuredClone(manifest);mismatched.cases[0].records[0].work_id='wrong-work';
 assert.throws(()=>api.createFragment(mismatched,0,0,0,0),/work identity/);
});

test('ambiguous manifest identities are rejected on both creation and parsing',()=>{
 const api=codec(),duplicateRecord=structuredClone(manifest),duplicateFrame=structuredClone(manifest);
 duplicateRecord.cases[1].records.push(structuredClone(duplicateRecord.cases[1].records[1]));
 duplicateFrame.cases[1].records[1].frames.push(structuredClone(duplicateFrame.cases[1].records[1].frames[4]));
 const hash=fragment(JSON.stringify(location()));
 for(const ambiguous of [duplicateRecord,duplicateFrame]){
  assert.throws(()=>api.parseFragment(hash,ambiguous),/unique/);
  assert.throws(()=>api.createFragment(ambiguous,1,1,4,90),/unique/);
 }
});

test('the browser global uses the existing saved-location validator without Node APIs',()=>{
 codec();
 const context=vm.createContext({TextEncoder});
 vm.runInContext(fs.readFileSync(path.join(root,'saved_location.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(sharedPath,'utf8'),context);
 const hash=context.SharedLocation.createFragment(manifest,2,2,8,270);
 const text=context.SharedLocation.parseFragment(hash,manifest);
 assert.deepEqual(JSON.parse(text),location(2,2,8,270));
 const target=context.SavedLocation.parseSavedLocation(text,manifest);
 assert.equal(target.caseIndex,2);assert.equal(target.recordIndex,2);assert.equal(target.frameIndex,8);assert.equal(target.rotation,270);
 assert.throws(()=>context.SharedLocation.parseFragment(fragment(JSON.stringify({...location(),source_url:'https://invalid.example/'})),manifest));
});
