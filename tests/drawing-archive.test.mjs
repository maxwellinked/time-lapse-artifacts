import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildDrawingArchive } from "../assets/drawing-archive-model.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = read("../data/records.json");
const references = read("../data/physical-references.json");
const previews = read("../reference-previews/manifest.json");

test("groups the committed snapshot once per work without changing source evidence", () => {
  const before = JSON.stringify([data, references, previews]);
  const works = buildDrawingArchive(data, references, previews);
  assert.equal(works.length, 435);
  assert.equal(new Set(works.map((work) => work.workId)).size, 435);
  assert.equal(works.filter((work) => work.photograph).length, 80);
  assert.equal(works.filter((work) => work.status === "reference_review").length, 289);
  assert.equal(works.filter((work) => work.status === "no_published_photograph").length, 66);
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
  const large = works.filter((work) => work.photograph && Math.max(Number(work.photograph.width_px),Number(work.photograph.height_px))>1024);
  assert.equal(large.length, 41);
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

test("work links preserve every published candidate, evidence class and missing state", () => {
  const proof = read("../data/reference-link-evidence.json");
  const before = JSON.stringify([data, references, previews, proof]);
  const works = buildDrawingArchive(data, references, previews, proof);
  const reviewed = works.filter((work) => work.status === "reference_review");
  const counts = {};
  for (const work of reviewed) {
    assert.equal(work.photograph, null);
    assert.equal(work.displayUrl, null);
    const { photo, description } = work.referenceLinks[0];
    const key = description.title.startsWith("Unselected") ? "unresolved"
      : photo.view_purpose === "supplemental_documentation" ? "supplemental" : photo.source_binding_method;
    counts[key] = (counts[key] ?? 0) + 1;
    if (key === "unresolved") assert.equal(work.referenceLinks.length, 2);
    else assert.ok(work.referenceLinks.length >= 1);
  }
  assert.deepEqual(counts, {
    supplemental: 12, unresolved: 1,
    provenance_bound_review_derivative: 53, exact_historical_reference_bytes: 223,
  });
  for (const work of works) {
    const urls = work.records.flatMap((record) => {
      const entry = references.records[record.recordId];
      return [entry.mainImage, ...entry.additionalReferences].filter(Boolean).map((p) => p.fullResolutionUrl);
    });
    assert.deepEqual(new Set(work.referenceLinks.map((r) => r.photo.fullResolutionUrl)), new Set(urls));
  }
  const missing = works.find((work) => work.workId === "tlaw-2cbee1df4e1cff7a");
  assert.ok(missing.records.some((record) => record.recordId === "tla-7500b249133719dc"));
  assert.deepEqual(missing.referenceLinks, []);
  assert.equal(missing.status, "no_published_photograph");
  assert.equal(JSON.stringify([data, references, previews, proof]), before);
});

test("work evidence fails closed for stale bytes, revision or unavailable hashing", async () => {
  const { verifiedDrawingEvidence } = await import("../assets/drawing-archive-model.js");
  const bytes = readFileSync(new URL("../data/physical-references.json", import.meta.url));
  const proof = read("../data/reference-link-evidence.json");
  assert.equal(await verifiedDrawingEvidence(bytes, proof), proof);
  assert.equal(await verifiedDrawingEvidence(Buffer.concat([bytes, Buffer.from(" ")]), proof), null);
  assert.equal(await verifiedDrawingEvidence(bytes, proof, {}), null);
  for (const evidence of [null, { ...proof, sourceRevision: "0".repeat(40) }]) {
    const works = buildDrawingArchive(data, references, previews, evidence);
    const proposed = works.flatMap((work) => work.referenceLinks).filter((r) => r.photo.relationship_status === "proposed");
    assert.ok(proposed.length > 0);
    assert.ok(proposed.every((r) => !r.description.supportedIndirect && /support not verified/.test(r.description.title)));
    assert.equal(works.filter((work) => work.photograph).length, 80);
  }
});


test("optional evidence loading tolerates missing timeout API, network and JSON failures", async () => {
  const renderer = readFileSync(new URL("../assets/drawing-archive.js", import.meta.url), "utf8");
  const start = renderer.indexOf("(async () => {");
  const end = renderer.indexOf("})().catch(() => null)", start) + "})().catch(() => null)".length;
  const load = renderer.slice(start, end);
  for (const context of [
    { AbortSignal: {}, fetch: () => { throw new Error("Should not fetch"); } },
    { AbortSignal, fetch: async () => { throw new Error("Network unavailable"); } },
    { AbortSignal, fetch: async () => ({ ok: false }) },
    { AbortSignal, fetch: async () => ({ ok: true, json: async () => { throw new Error("Invalid JSON"); } }) },
  ]) assert.equal(await runInNewContext(load, context), null);
  const proof = read("../data/reference-link-evidence.json");
  assert.equal(await runInNewContext(load, {
    AbortSignal, fetch: async () => ({ ok: true, json: async () => proof }),
  }), proof);
});
