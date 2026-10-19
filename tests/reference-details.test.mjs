import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getDisplayReference, referenceExclusion, describeReferenceLink } from "../assets/reference-policy.js";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const lookup = JSON.parse(readFileSync(new URL("../data/physical-references.json", import.meta.url), "utf8"));
const evidence = JSON.parse(readFileSync(new URL("../data/reference-link-evidence.json", import.meta.url), "utf8"));
const roleSource = app.slice(app.indexOf("function referenceRole("), app.indexOf("async function loadReferenceEvidence("));
const renderSource = app.slice(app.indexOf("function clearReference("), app.indexOf("function renderDialog("));

// Exercise the production renderer, including links, hidden state and navigation guards.
class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.textContent = ""; this.hidden = true; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  querySelector(tag) { return this.children.find((child) => child.tag === tag) ?? null; }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  removeAttribute(key) { delete this[key]; }
  addEventListener() {}
}

function renderer(proof = evidence, loader = async () => lookup) {
  const elements = Object.fromEntries(["referenceStage", "referenceStatus", "referenceRole", "referenceFull",
    "referenceRepresentation", "referenceDetails", "referenceWork", "referenceEvidence", "additionalReferences",
    "referenceManifest", "pairingClarification"].map((name) => [name, new Element()]));
  const state = { sourceRevision: lookup.sourceRevision, activeRecord: null };
  const render = runInNewContext(`${roleSource}\n${renderSource}\nrenderReference`, {
    elements, state, referenceGeneration: 0, getDisplayReference, referenceExclusion, describeReferenceLink,
    document: { createElement: (tag) => new Element(tag) }, loadReferenceLookup: loader,
    loadReferenceEvidence: async () => proof,
  });
  return { elements, state, show: async (recordId) => { state.activeRecord = { recordId }; await render({ recordId }); } };
}

function links(ui) { return ui.elements.additionalReferences.children.map((p) => p.children[0]); }

test("qualified links restore access while the strict population and source evidence stay unchanged", async () => {
  const before = JSON.stringify(lookup);
  assert.equal(Object.values(lookup.records).filter(getDisplayReference).length, 624);
  for (const [id, title] of [
    ["tla-f0885e72d6cf24d8", /inferred source variant/],
    ["tla-d9c55c2215a49da7", /Supported indirect reference/],
    ["tla-3f49a8917fe22676", /support not verified here/],
    ["tla-4db13002f09ad61e", /Supplemental documentation/],
  ]) {
    const fixture = structuredClone(lookup);
    if (id === "tla-f0885e72d6cf24d8") fixture.records[id].mainImage.source_binding_method = "inferred_same_capture_export_variant";
    const ui = renderer(evidence, async () => fixture); await ui.show(id);
    assert.equal(ui.elements.referenceStage.children.length, 0, id);
    assert.equal(ui.elements.referenceStage.hidden, true, id);
    assert.equal(ui.elements.referenceFull.hidden, true, id);
    assert.equal(ui.elements.referenceDetails.hidden, false, id);
    assert.equal(links(ui).length, 1, id);
    assert.match(links(ui)[0].textContent, title);
    assert.equal(links(ui)[0].href, lookup.records[id].mainImage.fullResolutionUrl);
    assert.equal(links(ui)[0].target, "_blank");
    assert.equal(links(ui)[0].rel, "noreferrer");
  }
  assert.equal(JSON.stringify(lookup), before);
});

test("unresolved candidates get equal qualified links without a chosen primary", async () => {
  const ui = renderer(); await ui.show("tla-f27d620979e140d9");
  assert.equal(links(ui).length, 2);
  assert.ok(links(ui).every((link) => link.textContent.startsWith("Unselected candidate")));
  assert.equal(ui.elements.referenceRole.textContent, "Primary selection unresolved");
  assert.equal(ui.elements.referenceStage.children.length, 0);
});

test("missing photographs are distinguished from an unresolved work identity", async () => {
  const ui = renderer(); await ui.show("tla-f667e7cf1e5da54e");
  assert.equal(ui.elements.referenceRole.textContent, "No published photograph");
  assert.match(ui.elements.referenceStatus.textContent, /established work link/);
  assert.equal(ui.elements.referenceStage.hidden, true);
  assert.equal(links(ui).length, 0);
  assert.match(referenceExclusion({ workId: null })[0], /Work link unresolved/);
});

test("status labels alone, stale evidence and altered file/work bindings never establish indirect support", () => {
  const entry = lookup.records["tla-d9c55c2215a49da7"], image = entry.mainImage;
  assert.equal(describeReferenceLink(entry, image, evidence, lookup.sourceRevision).supportedIndirect, true);
  for (const proof of [null, { ...evidence, sourceRevision: "0".repeat(40) }, { ...evidence, images: {} }]) {
    assert.equal(describeReferenceLink(entry, image, proof, lookup.sourceRevision).supportedIndirect, false);
  }
  for (const change of [{ sha256: "f".repeat(64) }, { evidence_reference_id: "tlar-0000000000000000" },
    { work_id: "tlaw-0000000000000000" }, { authority_class: "assistant_review" }]) {
    assert.equal(describeReferenceLink(entry, { ...image, ...change }, evidence, lookup.sourceRevision).supportedIndirect, false);
  }
});

test("unavailable premise evidence keeps an honest proposed label and preserves access", async () => {
  const ui = renderer(null); await ui.show("tla-d9c55c2215a49da7");
  assert.match(links(ui)[0].textContent, /support not verified here/);
  assert.equal(ui.elements.referenceRole.textContent, "Proposed reference only");
});

test("navigation clears prior links and does not leak a prior record's evidence", async () => {
  const ui = renderer(); await ui.show("tla-b3e2b99b4ba1030e");
  assert.equal(ui.elements.referenceStage.hidden, false);
  assert.equal(ui.elements.referenceStage.children.length, 1);
  await ui.show("tla-d9c55c2215a49da7");
  assert.equal(ui.elements.referenceStage.hidden, true);
  assert.equal(ui.elements.referenceStage.children.length, 0);
  await ui.show("tla-f667e7cf1e5da54e");
  assert.equal(links(ui).length, 0);
  assert.equal(ui.elements.referenceDetails.hidden, true);
  assert.equal(ui.elements.referenceFull.href, undefined);
});

test("a delayed lookup from a previous record cannot overwrite the current dialog", async () => {
  let finishFirst, calls = 0;
  const ui = renderer(evidence, () => ++calls === 1 ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve(lookup));
  const first = ui.show("tla-d9c55c2215a49da7");
  await ui.show("tla-f667e7cf1e5da54e");
  finishFirst(lookup); await first;
  assert.equal(ui.elements.referenceRole.textContent, "No published photograph");
  assert.equal(links(ui).length, 0);
});
