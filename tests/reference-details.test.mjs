import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getDisplayReference, referenceExclusion, describeReferenceLink } from "../assets/reference-policy.js";
import { getPhotographDisplayRotation } from "../assets/photograph-orientation.js";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const lookup = JSON.parse(readFileSync(new URL("../data/physical-references.json", import.meta.url), "utf8"));
const evidence = JSON.parse(readFileSync(new URL("../data/reference-link-evidence.json", import.meta.url), "utf8"));
const roleSource = app.slice(app.indexOf("function referenceRole("), app.indexOf("async function loadReferenceEvidence("));
const renderSource = app.slice(app.indexOf("function clearReference("), app.indexOf("function renderDialog("));

// Exercise the production renderer, including links, hidden state and navigation guards.
class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.textContent = ""; this.hidden = true; this.classList = new Set(); }
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
    getPhotographDisplayRotation,
    // Exercise retained historical source rendering; selected-front rendering has its own integration test.
    loadSelectedFrontLookup: async () => null, getSelectedFrontForRecord: () => null,
    document: { createElement: (tag) => new Element(tag) }, loadReferenceLookup: loader,
    loadReferenceEvidence: async () => proof,
  });
  return { elements, state, show: async (recordId) => { state.activeRecord = { recordId }; await render({ recordId }); } };
}

function links(ui) { return ui.elements.additionalReferences.children.map((p) => p.children[0]); }

test("owner-approved rotation follows the selected photograph without leaking to the next recording", async () => {
  const ui = renderer();
  const before = JSON.stringify(lookup);
  for (const id of ["tla-b82dcb656ccbe84a", "tla-0107ee972bd69249", "tla-3017b3e41ca4fde9", "tla-b711b80d21a53e47"]) {
    await ui.show(id);
    assert.ok(ui.elements.referenceStage.querySelector("img").classList.has("owner-rotation-clockwise"));
    assert.equal(ui.elements.referenceFull.href, lookup.records[id].mainImage.fullResolutionUrl);
  }
  await ui.show("tla-f0885e72d6cf24d8");
  assert.equal(ui.elements.referenceStage.querySelector("img").classList.has("owner-rotation-clockwise"), false);
  assert.equal(JSON.stringify(lookup), before);
});

test("qualified links restore access while the strict population and source evidence stay unchanged", async () => {
  const before = JSON.stringify(lookup);
  assert.equal(Object.values(lookup.records).filter(getDisplayReference).length, 632);
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

test("a public display derivative loads directly with a limited-source label and a published-image link", async () => {
  const fixture = structuredClone(lookup), id = "tla-b3e2b99b4ba1030e";
  Object.assign(fixture.records[id].mainImage, {
    source_binding_method: "owner_confirmed_display_derivative", processing_method: "public_display_JPEG_bytes_unchanged",
    inspection_resolution_class: "limited_resolution_full_drawing_reference", evidence_reference_id: "M002",
    width_px: "768", height_px: "1024", encoded_width_px: "768", encoded_height_px: "1024",
    size_bytes: "417210", orientation: "1",
  });
  const ui = renderer(evidence, async () => fixture); await ui.show(id);
  assert.equal(ui.elements.referenceStage.querySelector("img").src, fixture.records[id].mainImage.fullResolutionUrl);
  assert.match(ui.elements.referenceRepresentation.textContent, /public display JPEG; limited derivative, not original source bytes/);
  assert.match(ui.elements.referenceFull.textContent, /published display photograph/);
  await ui.show("tla-f0885e72d6cf24d8");
  assert.match(ui.elements.referenceFull.textContent, /full-resolution photograph/);
});

test("both published pilot photographs render from their exact pinned public JPEGs", async () => {
  const ui = renderer();
  for (const [id, review, hash] of [
    ["tla-81af436a01eb6990", "M002", "8721989cc5ce24bfda1b936dd9a57d68cabc4e2c8dc44d4bad4290f7517b20b4"],
    ["tla-f667e7cf1e5da54e", "M055", "40a44df38b84ac625a2fdae8b3ffa5759da1fa909087e8c40867a377a7f940f5"],
  ]) {
    const image = lookup.records[id].mainImage;
    assert.equal(image.sha256, hash); assert.equal(image.evidence_reference_id, review);
    await ui.show(id);
    const displayed = ui.elements.referenceStage.querySelector("img");
    assert.equal(displayed.src, image.fullResolutionUrl);
    assert.ok(displayed.src.includes(`/resolve/${lookup.sourceRevision}/`));
    assert.equal(displayed.classList.has("owner-rotation-clockwise"), false);
    assert.match(ui.elements.referenceRole.textContent, /limited resolution/);
    assert.match(ui.elements.referenceRepresentation.textContent, /public display JPEG/);
    assert.match(ui.elements.referenceFull.textContent, /published display photograph/);
  }
});

test("unresolved candidates get equal qualified links without a chosen primary", async () => {
  const ui = renderer(); await ui.show("tla-f27d620979e140d9");
  assert.equal(links(ui).length, 2);
  assert.ok(links(ui).every((link) => link.textContent.startsWith("Unselected candidate")));
  assert.equal(ui.elements.referenceRole.textContent, "Primary selection unresolved");
  assert.equal(ui.elements.referenceStage.children.length, 0);
});

test("missing photographs are distinguished from an unresolved work identity", async () => {
  const ui = renderer(); await ui.show("tla-7500b249133719dc");
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
  await ui.show("tla-7500b249133719dc");
  assert.equal(links(ui).length, 0);
  assert.equal(ui.elements.referenceDetails.hidden, true);
  assert.equal(ui.elements.referenceFull.href, undefined);
});

test("a delayed lookup from a previous record cannot overwrite the current dialog", async () => {
  let finishFirst, calls = 0;
  const ui = renderer(evidence, () => ++calls === 1 ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve(lookup));
  const first = ui.show("tla-d9c55c2215a49da7");
  await ui.show("tla-7500b249133719dc");
  finishFirst(lookup); await first;
  assert.equal(ui.elements.referenceRole.textContent, "No published photograph");
  assert.equal(links(ui).length, 0);
});
