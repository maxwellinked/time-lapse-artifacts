import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDrawingArchive } from "../assets/drawing-archive-model.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = read("../data/records.json");
const references = read("../data/physical-references.json");
const previews = read("../reference-previews/manifest.json");

test("groups the committed snapshot once per work without changing source evidence", () => {
  const before = JSON.stringify([data, references, previews]);
  const works = buildDrawingArchive(data, references, previews);
  assert.equal(works.length, 431);
  assert.equal(new Set(works.map((work) => work.workId)).size, 431);
  assert.equal(works.filter((work) => work.photograph).length, 40);
  assert.equal(works.filter((work) => work.status === "reference_review").length, 328);
  assert.equal(works.filter((work) => work.status === "no_published_photograph").length, 63);
  assert.deepEqual(works.flatMap((work) => work.records.map((record) => record.recordId)).sort(),
    data.records.map((record) => record.recordId).sort());
  assert.equal(JSON.stringify([data, references, previews]), before);
});

test("rejects mismatched revisions, missing work IDs and incomplete coverage", () => {
  assert.throws(() => buildDrawingArchive(data, { ...references, sourceRevision: "0".repeat(40) }, previews), /revisions/);
  const missing = structuredClone(references);
  delete missing.records[data.records[0].recordId];
  assert.throws(() => buildDrawingArchive(data, missing, previews), /coverage/);
  const unlinked = structuredClone(references);
  unlinked.records[data.records[0].recordId].workId = null;
  assert.throws(() => buildDrawingArchive(data, unlinked, previews), /work ID/);
});

test("withholds a work image if its recordings disagree about primary eligibility", () => {
  const work = buildDrawingArchive(data, references, previews).find((work) => work.photograph && work.records.length > 1);
  const changed = structuredClone(references);
  changed.records[work.records[0].recordId].mainImage.relationship_status = "proposed";
  const result = buildDrawingArchive(data, changed, previews).find((candidate) => candidate.workId === work.workId);
  assert.equal(result.photograph, null);
  assert.equal(result.displayUrl, null);
  assert.equal(result.status, "reference_review");
});

test("large photographs require a correctly bound small preview and never fall back", () => {
  const works = buildDrawingArchive(data, references, previews);
  const large = works.filter((work) => work.displayUrl?.startsWith("reference-previews/"));
  assert.equal(large.length, 3);
  for (const work of large) {
    for (const replacement of [null, { ...previews.images[work.photograph.sha256], sourceUrl: "https://example.com/other.jpg" },
      { ...previews.images[work.photograph.sha256], width: 2048 }]) {
      const changed = structuredClone(previews);
      changed.images[work.photograph.sha256] = replacement;
      const result = buildDrawingArchive(data, references, changed).find((candidate) => candidate.workId === work.workId);
      assert.equal(result.displayUrl, null);
      assert.equal(result.status, "display_unavailable");
    }
  }
});
