import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  deriveRecordingSequences,
  sortRecordsForDisplay,
} from "../assets/record-sequences.js";
import { getDisplayReference } from "../assets/reference-policy.js";
import { getSelectedFrontForRecord } from "../assets/selected-fronts.js";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
// Run the browser's actual filter functions without starting its DOM/media UI.
const filterSource = app.slice(app.indexOf("function recordMatches("), app.indexOf("function renderRecords("));
assert.ok(filterSource.includes("async function applyFilters()"));
const payload = JSON.parse(readFileSync(new URL("../data/records.json", import.meta.url), "utf8"));
const published = JSON.parse(readFileSync(new URL("../data/physical-references.json", import.meta.url), "utf8"));

async function filter(records, lookup, values = { photograph: "with" }) {
  const state = {
    records,
    sourceRevision: payload.sourceRevision,
    sequenceDetails: deriveRecordingSequences(records),
  };
  const elements = {
    filters: { elements: { photograph: { value: values.photograph ?? "" } } },
    grid: { setAttribute() {}, removeAttribute() {} },
    showMore: {}, resultCount: {}, retryPhotoFilter: {},
  };
  let lookupLoads = 0;
  await runInNewContext(`${filterSource}\napplyFilters()`, {
    state, elements, PAGE_SIZE: 18, filterGeneration: 0,
    FormData: class { get(name) { return values[name] ?? ""; } },
    // Explicit resolver fixtures preserve the historical inclusion/exclusion cases.
    // The production projection's 1,256 joins are exercised by selected-fronts.test.mjs.
    loadSelectedFrontLookup: async () => { lookupLoads += 1; return {byRecord: Object.fromEntries(
      Object.entries(lookup.records).filter(([,entry]) => getDisplayReference(entry)).map(([id,entry]) => [id,entry.mainImage]))}; },
    getSelectedFrontForRecord,
    getDisplayReference,
    sortRecordsForDisplay,
    renderRecords() {},
  });
  return { records: state.filtered, lookupLoads };
}

test("the filter respects the corrected 633-entry resolver without modifying its source evidence", async () => {
  const before = JSON.stringify(published);
  const result = await filter(payload.records, published);
  const ids = new Set(result.records.map((record) => record.recordId));
  assert.equal(ids.size, 633);
  for (const recordId of ids) {
    const entry = published.records[recordId];
    assert.equal(entry.selectionStatus, "primary_inspection");
    assert.equal(entry.mainImage.relationship_status, "owner_confirmed");
    assert.equal(entry.mainImage.view_purpose, "primary_inspection");
    assert.ok(["exact_confirmed_source_bytes", "owner_confirmed_display_derivative"].includes(entry.mainImage.source_binding_method));
  }
  for (const id of ["tla-f27d620979e140d9", "tla-bdbd7d2e290b638a"]) {
    assert.ok(!ids.has(id), `${id} has unresolved published candidates, not a confirmed drawing reference`);
    assert.equal(published.records[id].mainImage, null);
    assert.equal(published.records[id].selectionStatus, "selection_unresolved");
    assert.equal(published.records[id].additionalReferences.length, 2);
    assert.equal(published.records[id].clarification, "");
  }
  assert.equal(JSON.stringify(published), before, "filtering must not alter reference evidence");
});

test("filter accepts the confirmed primary and excludes supplemental, inferred, proposed and unresolved references", async () => {
  const records = payload.records.slice(0, 8);
  const confirmed = structuredClone(Object.values(published.records).find((entry) => getDisplayReference(entry)));
  Object.assign(confirmed, { referenceCount: 1, primaryReferenceCount: 1, additionalReferences: [] });
  const entries = Array.from({ length: 5 }, () => structuredClone(confirmed));
  Object.assign(entries[1], { selectionStatus: "single_supplemental", primaryReferenceCount: 0 });
  Object.assign(entries[1].mainImage, {
    view_purpose: "supplemental_documentation", inspection_resolution_class: "supplemental_documentation",
    sha256: "b".repeat(64),
  });
  entries[2].mainImage.source_binding_method = "inferred_same_capture_export_variant";
  Object.assign(entries[3].mainImage, {
    relationship_status: "proposed", evidence_class: "deterministic_transitive_bridge",
    authority_class: "derived_from_owner_confirmed_edges", derivation_method: "transitive_closure",
    source_binding_method: "exact_historical_reference_bytes", sha256: "c".repeat(64),
  });
  Object.assign(entries[4], {
    referenceCount: 2, primaryReferenceCount: 2, selectionStatus: "selection_unresolved", mainImage: null,
    additionalReferences: [structuredClone(confirmed.mainImage), structuredClone(entries[3].mainImage)],
  });
  entries.push(
    { referenceCount: 0, mainImage: null, additionalReferences: [], selectionStatus: "missing_public_photo" },
    { referenceCount: 0, mainImage: null, additionalReferences: [], selectionStatus: "missing_work_link" },
    structuredClone(confirmed),
  );
  entries[7].referenceCount = 2;
  entries[7].additionalReferences.push(structuredClone(entries[1].mainImage));
  const before = JSON.stringify(entries);
  const lookup = { records: Object.fromEntries(records.map((record, index) => [record.recordId, entries[index]])) };
  const result = await filter(records, lookup);
  assert.deepEqual(new Set(result.records.map((record) => record.recordId)), new Set([records[0].recordId, records[7].recordId]));
  assert.equal(JSON.stringify(entries), before, "filtering must retain excluded source evidence unchanged");
});

test("photograph filtering composes with search, year, tool, dimensions and order", async () => {
  const record = payload.records.find(({ recordId }) => getDisplayReference(published.records[recordId]));
  const values = { photograph: "with", search: record.recordId, year: record.date.slice(0, 4),
    tool: record.tool.split(";")[0], dimensions: record.dimensions, order: "asc" };
  assert.deepEqual((await filter(payload.records, published, values)).records, [record]);
  assert.equal((await filter(payload.records, published, { ...values, year: "1900" })).records.length, 0);
});

test("unfiltered browsing keeps every recording without loading photograph evidence", async () => {
  const result = await filter(payload.records, null, { photograph: "" });
  assert.equal(result.records.length, payload.records.length);
  assert.equal(result.lookupLoads, 0);
});
