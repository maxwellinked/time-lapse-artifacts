import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const closeSource = app.slice(app.indexOf('elements.dialog.addEventListener("close"'),
  app.indexOf('elements.showMore.addEventListener("click"'));
const hashSource = app.slice(app.indexOf("function openHashRecord("), app.indexOf("// Cleanup on page unload"));

function navigation(url) {
  const location = new URL(url);
  const events = new Map();
  const records = [{ recordId: "tla-abcd" }, { recordId: "tla-cdef" }];
  const state = { records, activeRecord: records[0], ready: true };
  const calls = { referenceClears: 0, videoResets: 0, opened: [] };
  let onClose;
  const dialog = {
    open: true,
    addEventListener(name, listener) { assert.equal(name, "close"); onClose = listener; },
    close() { this.open = false; onClose(); },
  };
  runInNewContext(`${closeSource}\n${hashSource}`, {
    elements: { dialog }, location, state,
    history: { replaceState(_state, _title, next) { location.href = new URL(next, location).href; } },
    window: { addEventListener(name, listener) { events.set(name, listener); } },
    clearReference() { calls.referenceClears++; },
    relatedRecordings: { clear() {} },
    resetDialogVideo() { calls.videoResets++; },
    openRecord(record, updateHash) { calls.opened.push({ record, updateHash }); state.activeRecord = record; dialog.open = true; },
  });
  return { location, dialog, state, calls, followHash(hash) { location.hash = hash; events.get("hashchange")(); } };
}

test("closing a filtered recording preserves its shareable photograph query", () => {
  const ui = navigation("https://example.test/archive/?photograph=with&extra=kept#record=tla-abcd");
  ui.dialog.close();
  assert.equal(ui.location.href, "https://example.test/archive/?photograph=with&extra=kept");
  assert.equal(ui.state.activeRecord, null);
  assert.equal(ui.calls.referenceClears, 1);
  assert.equal(ui.calls.videoResets, 1);
});

test("same-page browse navigation closes the dialog and retains the grid target", () => {
  const ui = navigation("https://example.test/archive/?photograph=with#record=tla-abcd");
  ui.followHash("#recordings");
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.location.href, "https://example.test/archive/?photograph=with#recordings");
  assert.equal(ui.state.activeRecord, null);
  assert.equal(ui.calls.referenceClears, 1);
  assert.equal(ui.calls.videoResets, 1);
});

test("record-to-record fragment navigation keeps the dialog and selected filter", () => {
  const ui = navigation("https://example.test/archive/?photograph=with#record=tla-abcd");
  ui.followHash("#record=tla-cdef");
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.state.activeRecord.recordId, "tla-cdef");
  assert.equal(ui.location.search, "?photograph=with");
  assert.equal(ui.calls.opened[0].updateHash, false);
  assert.equal(ui.calls.videoResets, 0);
});
