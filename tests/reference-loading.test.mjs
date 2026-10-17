import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { describeReferenceLink } from "../assets/reference-policy.js";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const source = app.slice(app.indexOf("async function loadReferenceEvidence("), app.indexOf("function clearReference("));
const raw = readFileSync(new URL("../data/physical-references.json", import.meta.url), "utf8");
const lookup = JSON.parse(raw);
const evidence = JSON.parse(readFileSync(new URL("../data/reference-link-evidence.json", import.meta.url), "utf8"));
const recordId = "tla-d9c55c2215a49da7";

function loaders(lookupBytes = raw, crypto = webcrypto) {
  let proofLoads = 0;
  const api = runInNewContext(`${source}\n({loadReferenceLookup, loadReferenceEvidence})`, {
    referenceLookupPromise: undefined, referenceEvidencePromise: undefined,
    REFERENCE_URL: "data/physical-references.json", state: { sourceRevision: lookup.sourceRevision,
      records: Object.keys(lookup.records).map((recordId) => ({ recordId })) },
    AbortController, AbortSignal, TextDecoder, Uint8Array,
    window: { setTimeout, clearTimeout, crypto },
    fetch: async (url) => {
      if (url === "data/physical-references.json") return new Response(lookupBytes);
      proofLoads++; return new Response(JSON.stringify(evidence));
    },
  });
  return { ...api, proofLoads: () => proofLoads };
}

test("support evidence is bound to the exact bytes of the loaded photograph lookup", async () => {
  const api = loaders();
  const loaded = await api.loadReferenceLookup();
  assert.equal(loaded.lookupSha256, createHash("sha256").update(raw).digest("hex"));
  const proof = await api.loadReferenceEvidence(loaded.lookupSha256);
  assert.equal(proof.lookupSha256, loaded.lookupSha256);
  assert.equal(describeReferenceLink(loaded.records[recordId], loaded.records[recordId].mainImage,
    proof, lookup.sourceRevision).supportedIndirect, true);
});

test("same-revision cached evidence cannot support a lookup with changed receipt-bound fields", async () => {
  for (const field of ["image_path", "source_binding_method", "processing_method"]) {
    const changed = structuredClone(lookup), image = changed.records[recordId].mainImage;
    if (field === "image_path") {
      image.image_path = image.image_path.replace(/[^/]+$/, "another-file.jpg");
      image.fullResolutionUrl = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${lookup.sourceRevision}/${image.image_path}`;
    } else if (field === "source_binding_method") image.source_binding_method = "exact_historical_reference_bytes";
    else {
      image.source_binding_method = "exact_historical_reference_bytes";
      image.processing_method = "embedded_primary_JPEG_codestream_and_ICC_preserved";
    }
    const api = loaders(JSON.stringify(changed)), loaded = await api.loadReferenceLookup();
    assert.equal(loaded.sourceRevision, lookup.sourceRevision);
    assert.equal(image.sha256, lookup.records[recordId].mainImage.sha256);
    assert.equal(image.evidence_reference_id, lookup.records[recordId].mainImage.evidence_reference_id);
    assert.notEqual(loaded.lookupSha256, evidence.lookupSha256);
    assert.equal(await api.loadReferenceEvidence(loaded.lookupSha256), null, field);
  }
});

test("an already cached proof is rechecked against every requested lookup identity", async () => {
  const api = loaders();
  assert.ok(await api.loadReferenceEvidence(evidence.lookupSha256));
  assert.equal(await api.loadReferenceEvidence("0".repeat(64)), null);
  assert.equal(api.proofLoads(), 1);
});

test("unavailable hashing preserves browsing but cannot establish supported evidence", async () => {
  const failing = loaders(raw, { subtle: { digest: async () => { throw new Error("unavailable"); } } });
  const loaded = await failing.loadReferenceLookup();
  assert.equal(Object.keys(loaded.records).length, Object.keys(lookup.records).length);
  assert.equal(loaded.lookupSha256, null);
  assert.equal(await failing.loadReferenceEvidence(loaded.lookupSha256), null);
  assert.equal(failing.proofLoads(), 0);
});
