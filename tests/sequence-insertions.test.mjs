import test from "node:test";
import assert from "node:assert/strict";
import { deriveRecordingSequences, sortRecordsForDisplay, extendVisibleCount } from "../assets/record-sequences.js";
const revision = "a".repeat(40);
const label = "2026-10-25.0938.BallpointPen.Ink.Paper.9x12";
const suffixes = ["01", "02", "03", "03a", "03b", "04", "05", "06", "07", "08", "09"];
const ids = [
  "tla-3629fd6f65c8e3fd", "tla-f4860d81610d06e2", "tla-ab38992860ebf086",
  "tla-f5575d594e459bfc", "tla-66500ae259f48f35", "tla-ee5ef18a738d9716",
  "tla-bc90bb2c30a23b73", "tla-4441345c1d3d1392", "tla-268196248f820e42",
  "tla-0a7b1ed861f10d7d", "tla-f3f1ebaf9ef0a80c",
];
const records = suffixes.map((part, i) => ({ recordId: ids[i], rowIndex: [1270,1271,1272,1303,1304,1273,1274,1275,1276,1277,1278][i], filename: `${label}.Rec${part}.mp4`, date: "2026-10-25", time: "09:38" }));
const projection = () => ({ schemaVersion: 1, sourceHubRevision: revision, sourceRegistry: { path: "Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json", sha256: "b".repeat(64) }, sequences: [{ fragmentSetLabel: label, sourceManifest: { path: "Standard_Time_Lapses/Provenance/Sequence_Insertions/2026-10-29-F/sequence.json", sha256: "c".repeat(64) }, recordIds: ids, evidence: { membership: "owner-confirmed", order: "visual-inference-with-device-metadata-corroboration", gapless_capture: "not-established" }, sequenceCompleteness: "unknown" }] });
test("explicit insertion order survives both sort directions, filtering, pagination and navigation", () => {
  const details = deriveRecordingSequences(records, projection(), revision);
  for (const order of ["asc", "desc"]) {
    const sorted = sortRecordsForDisplay(records.slice().reverse(), order, details);
    assert.deepEqual(sorted.map(r => r.recordId), ids);
    assert.equal(extendVisibleCount(sorted, 4, details), 11);
    const filtered = sortRecordsForDisplay(records.filter((_, i) => [2,3,4,5].includes(i)).reverse(), order, details);
    assert.deepEqual(filtered.map(r => r.recordId), ids.slice(2,6));
    assert.equal(filtered[filtered.findIndex(r => r.recordId === ids[3]) + 1].recordId, ids[4]);
    assert.equal(filtered[filtered.findIndex(r => r.recordId === ids[4]) - 1].recordId, ids[3]);
  }
  assert.equal(details.get(ids[5]).sequencePosition, 6);
  assert.match(details.get(ids[5]).label, /6 of 11/);
  assert.match(details.get(ids[5]).label, /inferred.*completeness unknown/);
});
test("insertion suffixes cannot silently fall back to filename ordering", () => {
  assert.throws(() => deriveRecordingSequences(records), /projection|insertion/i);
  assert.throws(() => deriveRecordingSequences(records, { ...projection(), sourceHubRevision: "d".repeat(40) }, revision), /revision/i);
  for (const change of [p => p.sequences[0].recordIds.pop(), p => p.sequences[0].recordIds.push(ids[0]), p => p.sequences[0].recordIds[3] = "tla-ffffffffffffffff", p => p.sequences[0].evidence.order = "owner-confirmed", p => p.sequences[0].recordIds.reverse(), p => p.sequences.push(p.sequences[0])]) {
    const p = structuredClone(projection()); change(p);
    assert.throws(() => deriveRecordingSequences(records, p, revision), /sequence|projection|member|order|evidence|duplicate/i);
  }
});
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { loadSequenceInsertions } from "../assets/sequence-insertions.js";
test("browser supplement loading refuses absent, invalid and unavailable insertion projections", async () => {
  const response = body => async () => new Response(body, {status: body === null ? 404 : 200});
  await assert.rejects(loadSequenceInsertions("projection", records, revision, {fetchImpl: response(null)}), /projection/);
  await assert.rejects(loadSequenceInsertions("projection", records, revision, {fetchImpl: response("{}")}));
  await assert.rejects(loadSequenceInsertions("projection", records, revision, {fetchImpl: async () => new Response("", {status: 503})}), /503/);
  assert.equal(await loadSequenceInsertions("projection", records.filter(r=>!/[ab]\.mp4$/.test(r.filename)), revision, {fetchImpl: response(null)}), null);
});
test("dialog keeps literal filename separate from qualified position and uses the filtered order for previous/next", () => {
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const source = app.slice(app.indexOf("function renderDialog(record)"), app.indexOf("function openRecord(record"));
  const details = deriveRecordingSequences(records, projection(), revision);
  const nodes = ["dialogRecordId","dialogAnchor","dialogTitle","dialogFilename","dialogHash","dialogSource","dialogSourceTop","dialogMetadata","previousRecord","nextRecord"];
  const elements = Object.fromEntries(nodes.map(n=>[n,{dataset:{}, replaceChildren(...rows) {this.rows=rows;}}]));
  const state = {filtered: records.slice(2,6), sequenceDetails: details, ready: true};
  const api = runInNewContext(source + "\n({renderDialog})", {state,elements,metadataRow:(name,value)=>({name,value}),formatDate:String,formatTime:String,humanizeToken:String,formatDimensions:String,formatDuration:String,relatedRecordings:{open(){}},resetDialogVideo(){},preparePreview(){},renderReference(){}});
  api.renderDialog(records[3]);
  assert.equal(elements.dialogFilename.textContent, `${label}.Rec03a.mp4`);
  assert.ok(elements.dialogMetadata.rows.some(r=>r.name === "Recording sequence" && /Position 4 of 11.*inferred.*unknown/.test(r.value)));
  assert.ok(elements.dialogMetadata.rows.some(r=>/Gapless capture/.test(r.name) && /not established/i.test(r.value)));
  assert.equal(elements.previousRecord.dataset.index,"0"); assert.equal(elements.nextRecord.dataset.index,"2");
});
test("gallery cards expose the explicit position in visible and accessible labels without rewriting filenames", () => {
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const source = app.slice(app.indexOf("function renderRecords()"), app.indexOf("function renderFeatured()"));
  const cards=[];
  const cloneNode = () => {
    const nodes=new Map();const card={querySelector(selector) {
      if(!nodes.has(selector))nodes.set(selector,{hidden:true,attributes:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(){}});
      return nodes.get(selector);
    }};cards.push(card);return card;
  };
  const state={ready:true,filtered:records,visibleCount:4,sequenceDetails:deriveRecordingSequences(records,projection(),revision)};
  const elements={grid:{replaceChildren(){},append(){}},cardTemplate:{content:{firstElementChild:{cloneNode}}},resultCount:{},showMore:{}};
  const api=runInNewContext(source+"\n({renderRecords})",{state,elements,extendVisibleCount,getRecordingPart:()=>null,document:{createDocumentFragment:()=>({append(){}})},formatDate:String,formatTime:String,humanizeToken:String,formatDimensions:String,formatDuration:String,preparePreview(){}});
  api.renderRecords();
  assert.equal(cards.length,11);
  assert.match(cards[3].querySelector(".record-part").textContent,/Position 4 of 11.*inferred.*unknown/);
  assert.match(cards[5].querySelector(".record-open").attributes["aria-label"],/Position 6 of 11.*inferred.*unknown.*Rec04\.mp4/);
  assert.equal(cards[5].querySelector(".record-part").hidden,false);
});
