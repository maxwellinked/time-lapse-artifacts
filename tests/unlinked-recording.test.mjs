import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {isUnlinkedRecording} from "../assets/unlinked-recording.js";
import {buildDrawingArchive} from "../assets/drawing-archive-model.js";
import {buildSelectedFrontIndex, getSelectedFrontForRecord} from "../assets/selected-fronts.js";
import {collectClarifications} from "../tools/build-photograph-clarifications.mjs";
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const original = read("../data/records.json");
const references = read("../data/physical-references.json");
const previews = read("../reference-previews/manifest.json");
const selected = read("../data/selected-fronts.json");
const empty = () => ({workId:"",selectionStatus:"missing_work_link",referenceRole:"missing",clarification:"",
  referenceCount:0,primaryReferenceCount:0,mainImage:null,additionalReferences:[]});
function fixture() {
  const data=structuredClone(original), refs=structuredClone(references);
  const id="tla-0000000000000000";
  assert.ok(!refs.records[id]);
  data.records.push({...data.records[0],recordId:id}); refs.records[id]=empty();
  return {data,refs,id};
}
test("unlinked recordings stay in the recording index without manufacturing drawing or photo links",()=>{
  const {data,refs,id}=fixture();
  const before=JSON.stringify([data,refs,selected]);
  const works=buildDrawingArchive(data,refs,previews);
  assert.equal(works.length,435);
  assert.ok(!works.some(w=>w.records.some(r=>r.recordId===id)));
  const index=buildSelectedFrontIndex(selected,data,refs);
  assert.equal(Object.keys(index.byWork).length,435);
  assert.equal(getSelectedFrontForRecord(index,id),null);
  assert.ok(data.records.some(r=>r.recordId===id));
  assert.equal(JSON.stringify([data,refs,selected]),before);
});
test("blank IDs cannot hide photographs, contradictory counts, malformed identities or unresolved selection states",()=>{
  for(const change of [e=>e.workId=null,e=>e.workId="bad-id",e=>e.selectionStatus="selection_unresolved",
    e=>e.mainImage={},e=>e.additionalReferences.push({}),e=>e.referenceCount=1,
    e=>e.primaryReferenceCount=1,e=>e.clarification="paired",e=>e.referenceRole="native full drawing"]) {
    const {data,refs,id}=fixture(); change(refs.records[id]);
    assert.equal(isUnlinkedRecording(refs.records[id]),false);
    assert.throws(()=>buildDrawingArchive(data,refs,previews));
    assert.throws(()=>buildSelectedFrontIndex(selected,data,refs));
  }
});
test("clarification entries never combine blank work IDs into an asserted drawing",()=>{
  const {data,refs,id}=fixture();
  const second="tla-0000000000000001";
  data.records.push({...data.records[0],recordId:second}); refs.records[second]=empty();
  const entries=collectClarifications(data,refs,null);
  assert.equal(entries.find(e=>e.key===id).records.length,1);
  assert.equal(entries.find(e=>e.key===second).records.length,1);
  assert.ok(!entries.some(e=>e.key===""));
});
test("the changed drawing model receives a fresh browser import URL",()=>{
  const gallery=readFileSync(new URL("../assets/drawing-archive.js",import.meta.url),"utf8");
  assert.ok(gallery.includes('"./drawing-archive-model.js?v=20261029-unlinked-recordings"'));
  assert.ok(!gallery.includes('"./drawing-archive-model.js?v=20261025-master-fronts"'));
});
