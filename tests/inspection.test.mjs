import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','inspection');
const json=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const manifest=json('manifest.json');
const records=manifest.cases.flatMap(c=>c.records);
const context=vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root,'saved_location.js'),'utf8'),context);
const api=context.SavedLocation;
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('inspection fixture retains nine sources and eighty-one samples',()=>{
 assert.equal(manifest.cases.length,3);assert.equal(records.length,9);
 assert.equal(new Set(records.map(r=>r.record_id)).size,9);
 assert.equal(records.reduce((n,r)=>n+r.frames.length,0),81);
});
test('source and derived assets are pinned to full non-placeholder revisions',()=>{
 assert.match(manifest.source_revision,/^[0-9a-f]{40}$/);
 assert.match(manifest.asset_revision,/^[0-9a-f]{40}$/);assert.notEqual(manifest.asset_revision,'0'.repeat(40));
 for(const r of records){
  assert.ok(r.source_url.includes('/resolve/'+manifest.source_revision+'/'));
  assert.equal(r.local_source_uri,undefined);
  for(const f of r.frames){assert.ok(f.png.startsWith(manifest.asset_base_url));assert.match(f.png_sha256,/^[0-9a-f]{64}$/);}
 }
});
test('committed navigation thumbnails match their receipt hashes',()=>{
 for(const r of records)for(const f of r.frames)assert.equal(digest(path.join(root,f.thumbnail)),f.thumbnail_sha256);
 for(const c of manifest.cases)if(c.photograph)assert.equal(digest(path.join(root,c.photograph.thumbnail)),c.photograph.thumbnail_sha256);
});
test('known first-case reference correction remains explicit',()=>{
 assert.match(manifest.cases[0].presentation_note,/correction pending/);
 assert.match(manifest.cases[0].presentation_note,/Two drawings/);
});
test('all samples and viewing rotations can be saved and resolved',()=>{
 let count=0;
 manifest.cases.forEach((c,ci)=>c.records.forEach((r,ri)=>r.frames.forEach((f,fi)=>{
  for(const rot of [0,90,180,270]){
   const saved=api.createSavedLocation(manifest,ci,ri,fi,rot);
   const restored=api.parseSavedLocation(JSON.stringify(saved),manifest);
   assert.equal(restored.caseIndex,ci);assert.equal(restored.recordIndex,ri);assert.equal(restored.frameIndex,fi);assert.equal(restored.rotation,rot);count++;
  }
 })));
 assert.equal(count,324);
});
test('invalid saved identities and injected fields fail without substitution',()=>{
 const good=api.createSavedLocation(manifest,0,0,4,90);
 for(const key of ['source_revision','source_sha256','png_sha256','work_id','source_url']){
  assert.throws(()=>api.resolveSavedLocation({...good,[key]:'wrong'},manifest));
 }
 assert.throws(()=>api.resolveSavedLocation({...good,pts:good.pts+1},manifest));
 assert.throws(()=>api.resolveSavedLocation({...good,image_url:'https://invalid.example/'},manifest));
});
test('runtime export contains no local paths, private receipts or attachment IDs',()=>{
 const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const p of visit(root))if(/\.(json|js|html|md|css)$/.test(p)){
  const text=fs.readFileSync(p,'utf8');
  for(const forbidden of ['file:///','C:\\','D:\\','C:/Users/','D:/Time-Lapse','file_000000','source_map.private','IMG_7967','IMG_7968'])assert.ok(!text.includes(forbidden),path.basename(p)+': '+forbidden);
 }
 assert.ok(!fs.existsSync(path.join(root,'review')));
});
test('published local-check summaries are hash-bound and distinct from raw logs',()=>{
 const checks=json('recorded_checks.json');assert.equal(checks.schema,'inspection-recorded-checks/v1');
 for(const r of Object.values(checks.records))for(const c of Object.values(r.checks))for(const ref of c.references){
  if(ref.url)assert.ok(ref.url.includes('/blob/'+ref.source_revision+'/'));
  else{assert.equal(ref.local_path,'evidence/validation-summary.json');assert.equal(digest(path.join(root,ref.local_path)),ref.sha256);assert.match(c.qualification,/sanitized summary/);}
 }
});
test('native image guard is pinned and source playback uses only manifest source URL',()=>{
 const controls=fs.readFileSync(path.join(root,'saved_location_controls.js'),'utf8');
 assert.ok(controls.includes('manifest.asset_base_url'));assert.ok(controls.includes('frame.png.startsWith(base)'));
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');assert.ok(app.includes('const uri=r.source_url;'));assert.ok(!app.includes('local_source_uri'));
});
test('public browser provides an inspection entry point',()=>{
 const home=fs.readFileSync(path.join(root,'..','index.html'),'utf8');assert.ok(home.includes('href="inspection/"'));
});
