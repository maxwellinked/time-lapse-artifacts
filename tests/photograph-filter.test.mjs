import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  deriveRecordingSequences,
  sortRecordsForDisplay,
} from "../assets/record-sequences.js";

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
    loadReferenceLookup: async () => { lookupLoads += 1; return lookup; },
    sortRecordsForDisplay,
    renderRecords() {},
  });
  return { records: state.filtered, lookupLoads };
}

test("published candidates qualify even when selection remains unresolved", async () => {
  const before = JSON.stringify(published);
  const result = await filter(payload.records, published);
  const ids = new Set(result.records.map((record) => record.recordId));
  const expected = payload.records.filter(({ recordId }) => {
    const entry = published.records[recordId];
    return entry.mainImage !== null || entry.additionalReferences.length > 0;
  });
  assert.equal(ids.size, expected.length);
  for (const record of expected) assert.ok(ids.has(record.recordId));
  for (const id of ["tla-f27d620979e140d9", "tla-bdbd7d2e290b638a"]) {
    assert.ok(ids.has(id), `${id} has published candidates`);
    assert.equal(published.records[id].mainImage, null);
    assert.equal(published.records[id].selectionStatus, "selection_unresolved");
    assert.equal(published.records[id].additionalReferences.length, 2);
    assert.equal(published.records[id].clarification, "");
  }
  assert.equal(JSON.stringify(published), before, "filtering must not alter reference evidence");
});

test("includes selected and supplemental photographs, excludes records with no photographs", async () => {
  const records = payload.records.slice(0, 5);
  const entries = [
    { referenceCount: 1, mainImage: { view_purpose: "primary_inspection" }, additionalReferences: [] },
    { referenceCount: 1, mainImage: { view_purpose: "supplemental_documentation" }, additionalReferences: [] },
    { referenceCount: 2, mainImage: null, additionalReferences: [{}, {}], selectionStatus: "selection_unresolved" },
    { referenceCount: 0, mainImage: null, additionalReferences: [], selectionStatus: "missing_public_photo" },
    { referenceCount: 0, mainImage: null, additionalReferences: [], selectionStatus: "missing_work_link" },
  ];
  const lookup = { records: Object.fromEntries(records.map((record, index) => [record.recordId, entries[index]])) };
  const result = await filter(records, lookup);
  assert.deepEqual(new Set(result.records.map((record) => record.recordId)), new Set(records.slice(0, 3).map((record) => record.recordId)));
  assert.equal(entries[2].mainImage, null);
  assert.equal(entries[2].selectionStatus, "selection_unresolved");
});

test("photograph filtering composes with search, year, tool, dimensions and order", async () => {
  const record = payload.records.find(({ recordId }) => recordId === "tla-f27d620979e140d9");
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
