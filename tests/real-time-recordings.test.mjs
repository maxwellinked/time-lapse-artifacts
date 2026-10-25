import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const recordData = JSON.parse(read("data/records.json"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const revision = recordData.sourceRevision;
const fields = ["record_id","file_name","original_filename","sha256","hub_xet_hash","size_bytes","duration_seconds","width_px","height_px","encoded_frame_rate","video_codec","pixel_format","has_audio","time_base","nb_frames","work_id","paired_record_id","pairing_status","temporal_basis","clock_accuracy_status","source_role_status","demux_status","notes"];
const row = {
  record_id:"tla-1173f78b2c88e6ca", file_name:"Real_Time_Recordings/2026-10/IMG_3223.MOV",
  original_filename:"IMG_3223.MOV", sha256:"2973d1ab13cf114d738e2f1bd918717dbba049f7c326db30527c83196ef8d1a4",
  hub_xet_hash:"3ad5fd7d446d146dc404effc43c1fc1cde5c935804f6bd45b7d9802cd5ef1e52",
  size_bytes:"12032805079", duration_seconds:"1154.030000", width_px:"3840", height_px:"2160",
  encoded_frame_rate:"59.972358", video_codec:"hevc", pixel_format:"yuv420p10le", has_audio:"true", time_base:"1/600", nb_frames:"69210", work_id:"",
  paired_record_id:"tla-6e997c9a39698d6b", pairing_status:"candidate_not_calibrated", temporal_basis:"encoded_media_timeline",
  clock_accuracy_status:"not_externally_calibrated", source_role_status:"not_independently_verified_as_camera_original",
  demux_status:"passed_no_logged_errors", notes:'Creator-reported unchanged source; review said "candidate",\nnot an assigned work.'
};
const quote = (v) => /[,"\r\n]/.test(v) ? '"'+v.replaceAll('"','""')+'"' : v;
function sources(rows=[row]) {
  const csv=Buffer.from(fields.join(",")+"\r\n"+rows.map(r=>fields.map(f=>quote(r[f])).join(",")).join("\r\n")+"\r\n");
  const sums=Buffer.from(rows.map(r=>`${r.sha256}  ${r.file_name}`).join("\r\n")+"\r\n");
  const manifest={sourceRepository:"maxwellinked/time-lapse-artifacts",sourceRevision:revision,
    inputs:{"Real_Time_Recordings/metadata.csv":{sha256:hash(csv),sizeBytes:csv.length},"Real_Time_Recordings/SHA256SUMS":{sha256:hash(sums),sizeBytes:sums.length}}};
  return {manifest,csv,sums};
}
async function modules() {
  assert.ok(existsSync(new URL("tools/build-real-time-recordings.mjs",root)),"Real-time metadata projection is not implemented yet");
  assert.ok(existsSync(new URL("assets/real-time-recordings.js",root)),"Real-time relationship access is not implemented yet");
  return {...await import("../tools/build-real-time-recordings.mjs"),...await import("../assets/real-time-recordings.js")};
}
async function projection(rows=[row]) { const m=await modules(); return {m,p:m.buildRealTimeProjection(recordData,sources(rows))}; }

test("real-time projection preserves every source value, blank identity, and explicit mode",async()=>{
  const {p}=await projection();
  assert.equal(p.sourceRevision,revision);assert.deepEqual(p.sourceFields,fields);
  const {recording_mode,...original}=p.records[0];assert.deepEqual(original,row);assert.equal(recording_mode,"real_time");
  assert.equal(p.sourceInputs["Real_Time_Recordings/metadata.csv"].sha256,sources().manifest.inputs["Real_Time_Recordings/metadata.csv"].sha256);
  assert.equal(p.records[0].work_id,"");assert.equal(p.records[0].pairing_status,"candidate_not_calibrated");
});
test("real-time projection rejects altered source bytes and mismatched checksum entries",async()=>{
  const m=await modules(),s=sources();
  assert.throws(()=>m.buildRealTimeProjection(recordData,{...s,csv:Buffer.concat([s.csv,Buffer.from("\n")])}),/source.*(hash|binding)|checksum/i);
  const bad={...row,sha256:"a".repeat(64)};const wrong=sources([bad]);wrong.sums=s.sums;wrong.manifest.inputs["Real_Time_Recordings/SHA256SUMS"]=s.manifest.inputs["Real_Time_Recordings/SHA256SUMS"];
  assert.throws(()=>m.buildRealTimeProjection(recordData,wrong),/checksum|SHA-256/i);
});
test("real-time index rejects wrong revision, duplicates, path escapes and invalid numeric metadata",async()=>{
  const {m,p}=await projection();
  for(const mutate of [q=>q.sourceRevision="a".repeat(40),q=>q.records.push({...q.records[0]}),q=>q.records[0].file_name="Real_Time_Recordings/../../private.MOV",q=>q.records[0].recording_mode="time_lapse",q=>q.records[0].size_bytes="-1",q=>q.records[0].encoded_frame_rate="NaN",q=>q.records[0].has_audio="maybe"]){
    const q=structuredClone(p);mutate(q);assert.throws(()=>m.validateRealTimePayload(q,recordData));
  }
});
test("multiple candidates and out-of-gallery relationships remain separate without inherited work data",async()=>{
  const second={...row,record_id:"tla-0000000000000001",file_name:"Real_Time_Recordings/2026-10/second.MOV",original_filename:"second.MOV",sha256:"1".repeat(64),hub_xet_hash:"2".repeat(64)};
  const outside={...second,record_id:"tla-0000000000000002",file_name:"Real_Time_Recordings/2026-10/outside.MOV",original_filename:"outside.MOV",sha256:"3".repeat(64),hub_xet_hash:"4".repeat(64),paired_record_id:"tla-ffffffffffffffff"};
  const {m,p}=await projection([row,second,outside]);
  assert.equal(m.relatedRealTimeRecords(p,row.paired_record_id).length,2);
  assert.equal(p.records.length,3);assert.ok(p.records.every(r=>r.work_id===""));
  const html=m.buildRealTimePage(p,recordData);
  assert.ok(html.includes(outside.paired_record_id));assert.ok(!html.includes(`href="./#record=${outside.paired_record_id}"`));
});
test("static real-time page escapes source notes, preserves status and uses pinned source links without a media request",async()=>{
  const dirty={...row,notes:'<img src=x onerror="alert(1)"> & "unchanged"'};
  const {m,p}=await projection([dirty]);const html=m.buildRealTimePage(p,recordData);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;unchanged&quot;'));
  assert.ok(html.includes(`id="${row.record_id}"`));assert.ok(html.includes(`href="./#record=${row.paired_record_id}"`));
  assert.ok(html.includes(`/resolve/${revision}/${row.file_name}`));assert.ok(html.includes("Candidate; timing not calibrated"));
  assert.ok(html.includes("Encoded media timeline"));assert.ok(html.includes("Not assigned in the source index"));
  assert.doesNotMatch(html,/<(?:video|audio|iframe|img)\b/i);
});
test("published real-time projection retains all five original records and remains reproducible offline",async()=>{
  const m=await modules();const csv=read("data/real-time-source/metadata.csv"),sums=read("data/real-time-source/SHA256SUMS"),manifest=JSON.parse(read("data/real-time-source/manifest.json"));
  assert.equal(hash(csv),"da903daccf89abe0d047a2e248499d95a78b7690322dca62ba2b638907c5136b");
  const p=m.buildRealTimeProjection(recordData,{manifest,csv,sums});assert.equal(p.records.length,5);
  assert.deepEqual(JSON.parse(read("data/real-time-recordings.json")),p);
  assert.equal(read("real-time-recordings.html").toString(),m.buildRealTimePage(p,recordData));
  assert.equal(p.records.filter(r=>r.demux_status==="completed_with_timestamp_errors").length,2);
});
test("related-record controller ignores delayed old results and cancellation",async()=>{
  const {m,p}=await projection();const pending=[],states=[];
  const controller=m.createRelatedRecordingsController({load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),show:s=>states.push(s)});
  const first=controller.open("tla-0000000000000000"),second=controller.open(row.paired_record_id);
  pending[1].resolve(p);await second;pending[0].reject(Error("Old failure"));await first;
  assert.equal(states.at(-1).state,"ready");assert.equal(states.at(-1).recordId,row.paired_record_id);assert.equal(states.at(-1).records[0].record_id,row.record_id);
  const count=states.length,third=controller.open(row.paired_record_id);controller.clear();pending[2].resolve(p);await third;
  assert.equal(states.length,count+1);
});
test("optional real-time lookup reports failure and supports a later retry",async()=>{
  const {m,p}=await projection();let attempts=0;const states=[];
  const controller=m.createRelatedRecordingsController({load:async()=>{if(++attempts===1)throw Error("Unavailable");return p;},show:s=>states.push(s)});
  await controller.open(row.paired_record_id);assert.equal(states.at(-1).state,"unavailable");
  await controller.open(row.paired_record_id);assert.equal(states.at(-1).state,"ready");assert.equal(states.at(-1).records.length,1);
});
