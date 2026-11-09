import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const rt=JSON.parse(readFileSync(new URL("../data/real-time-recordings.json",import.meta.url)));
const tl=JSON.parse(readFileSync(new URL("../data/records.json",import.meta.url)));
const byId=new Map(tl.records.map(r=>[r.recordId,r]));
const fixture=()=>({schemaVersion:1,sourceRepository:rt.sourceRepository,sourceRevision:"1232661117dd1720b4ead54f41ec9e5d4a5c5e0b",
  rotationBasis:"clockwise_after_source_display_rotation",scope:"viewing_only",reviewedAt:"2026-11-09",
  records:rt.records.map((r,i)=>({recordId:r.record_id,sourcePath:r.file_name,sourceSha256:r.sha256,
    pairedRecordId:r.paired_record_id,pairedSourcePath:decodeURIComponent(new URL(byId.get(r.paired_record_id).videoUrl).pathname).split("/").slice(6).join("/"),
    pairedSourceSha256:"a".repeat(64),pairedSourceXetHash:byId.get(r.paired_record_id).integrityReference,
    rotationClockwiseDegrees:i<2?0:90,sourceDisplayRotationDegrees:i<2?-90:0,
    samples:[{realTimeSeekSeconds:10,realTimePtsSeconds:10,timeLapseSeekSeconds:2,timeLapsePtsSeconds:2}],
    reviewBasis:"Asymmetric marks and sheet edges compared visually; no synchronization assertion."}))});

test("viewing orientation covers all source identities without changing source metadata",async()=>{
  const {validateRealTimeOrientation}=await import("../assets/real-time-orientation.js");
  const before=JSON.stringify(rt),m=fixture();
  assert.equal(validateRealTimeOrientation(m,rt,tl),m);
  assert.equal(JSON.stringify(rt),before);
  assert.equal(m.records.filter(r=>r.rotationClockwiseDegrees===90).length,16);
});

test("viewing orientation rejects incomplete, duplicate, stale or mismatched source bindings",async()=>{
  const {validateRealTimeOrientation}=await import("../assets/real-time-orientation.js");
  for(const change of [
    m=>m.records.pop(),m=>m.records[1]=structuredClone(m.records[0]),
    m=>m.records[0].sourceSha256="b".repeat(64),m=>m.records[0].sourcePath=m.records[1].sourcePath,
    m=>m.records[0].pairedRecordId=m.records[2].pairedRecordId,
    m=>m.records[0].pairedSourceXetHash="b".repeat(64),m=>m.records[0].pairedSourcePath="Standard_Time_Lapses/other.mp4",
    m=>m.records[0].rotationClockwiseDegrees=45,m=>m.rotationBasis="raw_encoded_pixels",
    m=>m.scope="source_orientation",m=>m.records[0].samples=[],m=>m.records[0].samples[0].realTimeSeekSeconds=-1,
  ]){const m=fixture();change(m);assert.throws(()=>validateRealTimeOrientation(m,rt,tl),/orientation/i);}
});

test("sample PTS stays explicitly unknown when only requested seek positions were retained",async()=>{
  const {validateRealTimeOrientation}=await import("../assets/real-time-orientation.js");
  const m=fixture();m.records[0].samples[0].realTimePtsSeconds=null;
  assert.equal(validateRealTimeOrientation(m,rt,tl),m);
});

test("published settings produce one lazy oriented player per recording and retain source links",async()=>{
  const {loadRealTimePresentation,buildRealTimePage}=await import("../tools/build-real-time-recordings.mjs");
  const settings=loadRealTimePresentation(rt,tl),html=buildRealTimePage(rt,tl,settings);
  assert.equal((html.match(/class="rt-player"/g)||[]).length,18);
  assert.equal((html.match(/data-rotation="90"/g)||[]).length,16);
  assert.equal((html.match(/data-rotation="0"/g)||[]).length,2);
  assert.doesNotMatch(html,/<(?:video|audio|iframe)\b/i);
  assert.ok(html.includes('src="assets/real-time-player.js"'));
  assert.ok(html.includes('href="assets/real-time-player.css"'));
  for(const r of rt.records)assert.ok(html.includes(`/resolve/${rt.sourceRevision}/${r.file_name}`));
});

test("retained viewing settings reject changed manifest bytes or a fabricated publication binding",async()=>{
  const {validateRealTimePresentation}=await import("../tools/build-real-time-recordings.mjs");
  const bytes=readFileSync(new URL("../data/real-time-orientation.json",import.meta.url));
  const receipt=JSON.parse(readFileSync(new URL("../data/real-time-orientation-source.json",import.meta.url)));
  assert.doesNotThrow(()=>validateRealTimePresentation(bytes,receipt,rt,tl));
  assert.throws(()=>validateRealTimePresentation(Buffer.concat([bytes,Buffer.from("\n")]),receipt,rt,tl),/binding/i);
  assert.throws(()=>validateRealTimePresentation(bytes,{...receipt,sourcePath:"unreviewed.json"},rt,tl),/binding/i);
});

test("oriented viewing is an additive page and preserves the historical metadata page byte for byte",async()=>{
  const {buildRealTimePage}=await import("../tools/build-real-time-recordings.mjs");
  const receipt=JSON.parse(readFileSync(new URL("../data/confirmed-work-refresh.json",import.meta.url)));
  assert.equal(createHash("sha256").update(buildRealTimePage(rt,tl)).digest("hex"),receipt.outputs["real-time-recordings.html"].sha256);
});
