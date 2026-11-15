import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { buildReviewedPhotographIndex, loadReviewedPhotographIndex,
  getReviewedPhotographForRecord, getReviewedPhotographForWork } from "../assets/reviewed-photographs.js";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const records = read("data/records.json");
const references = read("data/physical-references.json");
const projection = () => read("data/reviewed-photographs.json");

test("published reviewed photographs reach exactly their 70 linked recordings without selecting fronts", () => {
  const before = JSON.stringify(references);
  const index = buildReviewedPhotographIndex(projection(), records, references);
  assert.equal(Object.keys(index.byWork).length, 3);
  assert.equal(Object.keys(index.byRecord).length, 70);
  for (const [work, count] of [["tlaw-d5e993f2657744f6",38], ["tlaw-e5c89a91491998a7",3], ["tlaw-6a4a3ee3fdd84066",29]]) {
    const photo = getReviewedPhotographForWork(index, work);
    assert.equal(Object.values(index.byRecord).filter(p => p.workId === work).length, count);
    assert.equal(photo.selectedFrontPromoted, false);
    assert.equal(photo.endpointEquality, null);
    assert.equal(photo.displayDimensions, "6048 × 8064");
    assert.match(photo.qualification, /exact recording endpoint.*not established/i);
    assert.match(photo.fullResolutionUrl, /\/resolve\/202226b18431f67f879629d8f49d72883643f810\//);
    assert.match(photo.sourceMetadataUrl, /\/blob\/202226b18431f67f879629d8f49d72883643f810\//);
  }
  assert.equal(getReviewedPhotographForRecord(index, "tla-41667b16a88d464a").workId, "tlaw-6a4a3ee3fdd84066");
  assert.equal(getReviewedPhotographForRecord(index, "tla-f43f562de8d027ed").workId, "tlaw-d5e993f2657744f6");
  const unlinked = records.records.filter(r => !references.records[r.recordId]?.workId);
  assert.equal(unlinked.length, 55);
  for (const record of unlinked) assert.equal(getReviewedPhotographForRecord(index, record.recordId), null);
  assert.equal(JSON.stringify(references), before);
});

test("reviewed photographs retain historical links as current recording and work-link revisions advance", () => {
  const old = buildReviewedPhotographIndex(projection(), records, references);
  const nextRevision = "f".repeat(40);
  const next = structuredClone(records);
  const refs = structuredClone(references);
  next.sourceRevision = refs.sourceRevision = nextRevision;
  Object.assign(refs.sourceInputs["Work_Identity/work_record_links.csv"], {revision: nextRevision, sha256: "1".repeat(64)});
  for (const recording of next.records) {
    recording.videoUrl = recording.videoUrl.replace(`/resolve/${records.sourceRevision}/`, `/resolve/${nextRevision}/`);
  }
  assert.deepEqual(buildReviewedPhotographIndex(projection(), next, refs), old);
});

test("mixed pins, changed historical work links and changed recording integrity fail closed", () => {
  assert.throws(() => buildReviewedPhotographIndex(projection(), {...records, sourceRevision:"0".repeat(40)}, references), /snapshot|revision/);
  const changed = structuredClone(references);
  changed.sourceInputs["Work_Identity/work_record_links.csv"].revision = "0".repeat(40);
  assert.throws(() => buildReviewedPhotographIndex(projection(), records, changed), /work links/);
  const history = projection();
  history.recordingLinks.sha256 = "0".repeat(64);
  assert.throws(() => buildReviewedPhotographIndex(history, records, references), /historical work links/);
  const next = structuredClone(records);
  next.records.find(r => r.recordId === history.photographs[0].recordIds[0]).integrityReference = "0".repeat(64);
  assert.throws(() => buildReviewedPhotographIndex(projection(), next, references), /recording integrity/);
});

test("ambiguous works and unrecognized relationship claims are rejected", () => {
  const duplicate = projection(); duplicate.photographs.push(structuredClone(duplicate.photographs[0]));
  assert.throws(() => buildReviewedPhotographIndex(duplicate, records, references), /duplicate|ambiguous/);
  for (const fields of [{evidenceClass:"invented"}, {endpointEquality:true}, {selectedFrontPromoted:true}]) {
    const changed = projection(); Object.assign(changed.photographs[0], fields);
    assert.throws(() => buildReviewedPhotographIndex(changed, records, references), /evidence|qualification/);
  }
});

test("unsafe preview and original URLs cannot enter the display index", () => {
  for (const fields of [{displayUrl:"https://evil.example/image.jpg"}, {displayUrl:"reviewed-photographs/../x.jpg"},
    {fullResolutionUrl:"javascript:alert(1)"}, {sourceMetadataUrl:"https://evil.example/meta.json"},
    {imagePath:"Physical_References/Reviewed_Photographs/2026-11-10/images/../bad.jpg"}]) {
    const changed = projection(); Object.assign(changed.photographs[0], fields);
    assert.throws(() => buildReviewedPhotographIndex(changed, records, references), /path|URL/);
  }
});

test("record membership must agree with the browser's pinned work links", () => {
  const changed = projection(); changed.photographs[0].recordIds.pop();
  assert.throws(() => buildReviewedPhotographIndex(changed, records, references), /membership/);
  const refs = structuredClone(references);
  refs.records[projection().photographs[0].recordIds[0]].workId = "";
  assert.throws(() => buildReviewedPhotographIndex(projection(), records, refs), /membership/);
});

test("loading verifies exact projection bytes before building the index", async () => {
  const bytes = readFileSync(new URL("../data/reviewed-photographs.json", import.meta.url));
  const load = body => loadReviewedPhotographIndex(records, references, async () => new Response(body), webcrypto);
  assert.equal(Object.keys((await load(bytes)).byRecord).length, 70);
  await assert.rejects(load(Buffer.concat([bytes, Buffer.from(" ")])), /hash/);
  await assert.rejects(loadReviewedPhotographIndex(records, references, async () => new Response("", {status:404}), webcrypto), /404/);
});
