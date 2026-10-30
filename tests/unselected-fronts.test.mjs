import assert from "node:assert/strict";
import test from "node:test";
import * as fronts from "../assets/selected-fronts.js";

function fixture() {
  const selected = "tlaw-1111111111111111", unselected = "tlaw-2222222222222222";
  const links = {path:"Work_Identity/work_record_links.csv",sha256:"a".repeat(64)};
  const records = {sourceRepository:"maxwellinked/time-lapse-artifacts",sourceRevision:"b".repeat(40),
    records:[{recordId:"one"},{recordId:"two"}]};
  const references = {sourceRevision:records.sourceRevision,sourceInputs:{[links.path]:links},
    records:{one:{workId:selected},two:{workId:unselected}}};
  const projection = {selection_registry:{repository:"maxwellinked/time-lapse-artifacts",path:"Physical_References/Selected_Front_Downloads/selections.json",sha256:fronts.PHOTO_SELECTION_REGISTRY_SHA256,revision:fronts.PHOTO_SELECTION_SOURCE_REVISION},recording_links:links,selection_map_sha256:"c".repeat(64),candidate_table_sha256:"d".repeat(64),
    unselected_work_ids:[unselected],selections:[{work_id:selected,photo_role:"front",
      source_photograph_sha256:"e".repeat(64),display:{output_display_sha256:"f".repeat(64)}}]};
  return {selected,unselected,records,references,projection};
}

test("a positively linked new drawing can explicitly have no selected photograph",()=>{
  const f=fixture(); const index=fronts.buildSelectedFrontIndex(f.projection,f.records,f.references);
  assert.equal(fronts.getSelectedFrontForRecord(index,"two"),null);
  assert.equal(fronts.getSelectedFrontForWork(index,f.unselected),null);
  assert.equal(fronts.getSelectedFrontForRecord(index,"one").workId,f.selected);
  assert.deepEqual(index.unselectedWorkIds,[f.unselected]);
});

test("dropping a photograph without an explicit unselected declaration is rejected",()=>{
  const f=fixture(); delete f.projection.unselected_work_ids;
  assert.throws(()=>fronts.buildSelectedFrontIndex(f.projection,f.records,f.references),/coverage/);
});

test("unselected declarations cannot duplicate, overlap selected works, or name absent works",()=>{
  for (const mutation of [f=>f.projection.unselected_work_ids.push(f.unselected),
    f=>f.projection.unselected_work_ids.push(f.selected),
    f=>f.projection.unselected_work_ids=["tlaw-3333333333333333"]]) {
    const f=fixture();mutation(f);
    assert.throws(()=>fronts.buildSelectedFrontIndex(f.projection,f.records,f.references));
  }
});

test("gallery integration keeps an unselected drawing and its recording links",()=>{
  const f=fixture(); const index=fronts.buildSelectedFrontIndex(f.projection,f.records,f.references);
  const works=[{workId:f.selected,records:[f.records.records[0]]},
    {workId:f.unselected,records:[f.records.records[1]],photograph:null,status:"no_published_photograph"}];
  const before=JSON.stringify(works);
  const output=fronts.applySelectedFronts(works,index);
  assert.equal(output.length,2);assert.equal(output[1].selectedFront,null);
  assert.deepEqual(output[1].records,[{recordId:"two"}]);
  assert.equal(output[1].status,"no_published_photograph");
  assert.equal(output[0].displayUrl,`selected-fronts/${f.selected}.jpg`);
  assert.equal(JSON.stringify(works),before);
});
