import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {buildDrawingProcessPage} from '../tools/build-drawing-process.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const sourceRevision = 'a'.repeat(40), derivedRevision = 'b'.repeat(40);
const sourceRepository = 'maxwellinked/time-lapse-artifacts';
const derivedRepository = 'maxwellinked/time-lapse-artifacts-derived';
const notePath = 'docs/notes/drawing-process-2026-11-13';
function fixture() {
  const template = Buffer.from(`<!doctype html><html lang="en"><head><title>One drawing</title></head><body><h1>One drawing</h1><a href="https://huggingface.co/datasets/${sourceRepository}/blob/__SOURCE_REVISION__/${notePath}/README.md">Source note</a><img src="https://huggingface.co/datasets/${derivedRepository}/resolve/__DERIVED_REVISION__/Drawing_Process/2026-11-13/assets/detail.jpg"><p>Thicker lines reduce the negative space between them.</p></body></html>\n`);
  const derivatives = Buffer.from(JSON.stringify({repository:derivedRepository, revision:derivedRevision,files:[{derivative_id:'detail',path:'Drawing_Process/2026-11-13/assets/detail.jpg',bytes:3,sha256:'c'.repeat(64)}]}));
  const bindings = {'presentation.html':template, 'derivatives.json':derivatives};
  const noteManifest = Buffer.from(JSON.stringify({files:[...Object.entries(bindings).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)})),{path:'README.md',bytes:4,sha256:'d'.repeat(64)}]}));
  bindings['manifest.json'] = noteManifest;
  return {receipt:{schema:'drawing-process-browser-source/v1',sourceRepository,sourceRevision,notePath,derivedRepository,derivedRevision,inputs:Object.fromEntries(Object.entries(bindings).map(([p,b])=>[p,{bytes:b.length,sha256:hash(b)}]))}, files:bindings};
}
function rebound(inputs,name,value) {
  inputs.files[name] = Buffer.from(value);
  inputs.receipt.inputs[name] = {bytes:inputs.files[name].length,sha256:hash(inputs.files[name])};
}
function updatedTemplate(inputs,value) {
  rebound(inputs,'presentation.html',value);
  const manifest=JSON.parse(inputs.files['manifest.json']);
  Object.assign(manifest.files.find(f=>f.path==='presentation.html'), inputs.receipt.inputs['presentation.html']);
  rebound(inputs,'manifest.json',JSON.stringify(manifest));
}
test('public page substitutes immutable pins and otherwise preserves authoritative template bytes',()=>{
  const inputs=fixture();
  const expected=inputs.files['presentation.html'].toString().replaceAll('__SOURCE_REVISION__',sourceRevision).replaceAll('__DERIVED_REVISION__',derivedRevision);
  assert.equal(buildDrawingProcessPage(inputs),expected);
});
test('rejects a retained input changed without its receipt',()=>{
  const inputs=fixture();inputs.files['presentation.html']=Buffer.from('changed');
  assert.throws(()=>buildDrawingProcessPage(inputs),/input binding/i);
});
test('rejects a template missing from the authoritative note manifest',()=>{
  const inputs=fixture();const m=JSON.parse(inputs.files['manifest.json']);m.files=m.files.filter(f=>f.path!=='presentation.html');rebound(inputs,'manifest.json',JSON.stringify(m));
  assert.throws(()=>buildDrawingProcessPage(inputs),/note manifest/i);
});
test('rejects mutable or absent revision pins',()=>{
  for(const field of ['sourceRevision','derivedRevision'])for(const bad of ['main','',null,'0'.repeat(40)]){
    const inputs=fixture();inputs.receipt[field]=bad;assert.throws(()=>buildDrawingProcessPage(inputs),/revision/i);
  }
});
test('rejects disagreement between source derivative declaration and browser pin',()=>{
  const inputs=fixture();inputs.receipt.derivedRevision='e'.repeat(40);
  assert.throws(()=>buildDrawingProcessPage(inputs),/derived revision/i);
});
test('rejects media outside the declared source derivative set',()=>{
  const inputs=fixture();updatedTemplate(inputs,inputs.files['presentation.html'].toString().replace('assets/detail.jpg','assets/undeclared.jpg'));
  assert.throws(()=>buildDrawingProcessPage(inputs),/undeclared derivative/i);
});
test('rejects source links to an absent note file',()=>{
  const inputs=fixture();updatedTemplate(inputs,inputs.files['presentation.html'].toString().replace('README.md','missing.json'));
  assert.throws(()=>buildDrawingProcessPage(inputs),/undeclared source/i);
});
test('rejects accidentally retained private paths or unknown template tokens',()=>{
  for(const extra of ['file:///C:/Users/example/file.mp4','/workspace/output/private.json','__UNRESOLVED__']) {
    const inputs=fixture();updatedTemplate(inputs,inputs.files['presentation.html']+extra);
    assert.throws(()=>buildDrawingProcessPage(inputs),/private|template token/i);
  }
});
test('rejects unsafe derivative paths and duplicate media declarations',()=>{
  for(const mutate of [d=>d.files[0].path='Drawing_Process/2026-11-13/../private.jpg',d=>d.files.push(d.files[0])]) {
    const inputs=fixture(),d=JSON.parse(inputs.files['derivatives.json']);mutate(d);rebound(inputs,'derivatives.json',JSON.stringify(d));
    const m=JSON.parse(inputs.files['manifest.json']);Object.assign(m.files.find(f=>f.path==='derivatives.json'),inputs.receipt.inputs['derivatives.json']);rebound(inputs,'manifest.json',JSON.stringify(m));
    assert.throws(()=>buildDrawingProcessPage(inputs),/derivative path|duplicate/i);
  }
});
