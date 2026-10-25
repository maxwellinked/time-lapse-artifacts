import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildClarificationPage, collectClarifications, clarificationReasons, CLARIFICATION_FILTER_SCRIPT } from "../tools/build-photograph-clarifications.mjs";
import { getDisplayReference } from "../assets/reference-policy.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const payload = read("../data/records.json");
const lookup = read("../data/physical-references.json");
const evidence = read("../data/reference-link-evidence.json");
const reasons = (id, proof = evidence) => clarificationReasons(lookup.records[id], proof, payload.sourceRevision);

test("the confirmed July 2 drawing leaves the review queue while retaining its stable identity and filename", () => {
  const works = collectClarifications(payload, lookup, evidence);
  const work = works.find(({ workId }) => workId === "tlaw-110a1832f358f7cc");
  assert.equal(work, undefined);
  assert.ok(getDisplayReference(lookup.records["tla-f0885e72d6cf24d8"]));
  const record = payload.records.find(({ recordId }) => recordId === "tla-f0885e72d6cf24d8");
  assert.equal(record.filename, "2026-07-02.UnknownTime.BallpointPen.Ink.Paper.11x14.mp4");
  const html = buildClarificationPage(payload, lookup, evidence);
  assert.ok(!html.includes(`#record=${record.recordId}`));
  assert.ok(!html.includes(record.filename));
  assert.equal(works.length, new Set(works.map((entry) => entry.key)).size);
});

test("supported indirect references are not queued as unknown matches because their status is proposed", () => {
  const id = "tla-d9c55c2215a49da7";
  assert.equal(lookup.records[id].mainImage.relationship_status, "proposed");
  assert.deepEqual(reasons(id), []);
  assert.deepEqual(reasons("tla-3f49a8917fe22676"), ["proposed_match"]);
});

test("a transitive label cannot hide an unverified match when its supporting bindings are missing or changed", () => {
  const entry = lookup.records["tla-d9c55c2215a49da7"];
  for (const proof of [null, { ...evidence, images: {} }, { ...evidence, sourceRevision: "0".repeat(40) }]) {
    assert.ok(clarificationReasons(entry, proof, payload.sourceRevision).includes("proposed_match"));
  }
  for (const change of [{ sha256: "0".repeat(64) }, { evidence_reference_id: "" }, { authority_class: "unreviewed" }]) {
    const changed = { ...entry, mainImage: { ...entry.mainImage, ...change } };
    assert.ok(clarificationReasons(changed, evidence, payload.sourceRevision).includes("proposed_match"));
  }
  const direct = lookup.records["tla-4db13002f09ad61e"];
  assert.ok(clarificationReasons({ ...direct, mainImage: { ...direct.mainImage, evidence_class: "unreviewed" } },
    evidence, payload.sourceRevision).includes("proposed_match"), "owner_confirmed status alone is insufficient");
});

test("selection ambiguity, missing photographs and supplemental roles remain distinct without changing evidence", () => {
  const before = JSON.stringify({ payload, lookup, evidence });
  assert.ok(reasons("tla-f27d620979e140d9").includes("primary_selection"));
  assert.equal(lookup.records["tla-f27d620979e140d9"].mainImage, null);
  assert.deepEqual(reasons("tla-7500b249133719dc"), ["missing_photo"]);
  assert.deepEqual(reasons("tla-4db13002f09ad61e"), ["supplemental_only"]);
  assert.deepEqual(clarificationReasons({ workId: null }, evidence, payload.sourceRevision), ["missing_work"]);
  collectClarifications(payload, lookup, evidence);
  assert.equal(JSON.stringify({ payload, lookup, evidence }), before);
  assert.equal(Object.values(lookup.records).filter(getDisplayReference).length, 633);
});

test("the list rejects mixed snapshots and escapes archive text in recording links", () => {
  assert.throws(() => buildClarificationPage(payload, lookup, { ...evidence, sourceRevision: "0".repeat(40) }), /snapshot mismatch/);
  const changed = structuredClone(payload);
  const queuedId = collectClarifications(payload, lookup, evidence)[0].records[0].recordId;
  const record = changed.records.find(({ recordId }) => recordId === queuedId);
  record.filename = '<img src=x onerror="alert(1)">';
  const html = buildClarificationPage(changed, lookup, evidence);
  assert.ok(!html.includes('<img src=x onerror="alert(1)">'));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
});

test("search and reason selection compose to locate a drawing or show an honest empty result", () => {
  const html = buildClarificationPage(payload, lookup, evidence);
  assert.ok(html.includes(`<script>${CLARIFICATION_FILTER_SCRIPT}</script>`));
  const rows = [
    { textContent: "July 2, 2026 tla-f0885e72d6cf24d8", dataset: { reasons: "source_variant" } },
    { textContent: "another drawing", dataset: { reasons: "proposed_match" } },
  ];
  const search = { value: "", addEventListener() {} }, reason = { value: "", addEventListener() {} }, count = {};
  // Exercise the page's actual search and reason filtering functions.
  const context = { document: { querySelectorAll: () => rows, getElementById: (id) => ({ search, reason, "result-count": count }[id]) } };
  const filter = runInNewContext(CLARIFICATION_FILTER_SCRIPT + "\nfilterRows", context);
  search.value = "tla-f0885e72d6cf24d8"; reason.value = "source_variant"; filter();
  assert.equal(rows[0].hidden, false); assert.equal(rows[1].hidden, true); assert.equal(count.textContent, "1 drawing");
  reason.value = "proposed_match"; filter(); assert.equal(count.textContent, "0 drawings");
  search.value = ""; reason.value = ""; filter(); assert.ok(rows.every((row) => !row.hidden));
});
