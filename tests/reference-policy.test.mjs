import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getDisplayReference } from "../assets/reference-policy.js";

function fixture() {
  const workId = "tlaw-0123456789abcdef";
  return {
    workId,
    selectionStatus: "primary_inspection",
    referenceCount: 1,
    primaryReferenceCount: 1,
    mainImage: {
      work_id: workId,
      image_role: "drawing_reference",
      view_purpose: "primary_inspection",
      inspection_resolution_class: "native_full_resolution_inspection",
      relationship_status: "owner_confirmed",
      evidence_class: "direct_owner_confirmed",
      authority_class: "owner_direct",
      derivation_method: "direct_confirmation",
      source_binding_method: "exact_confirmed_source_bytes",
      sha256: "a".repeat(64),
      width_px: "600",
      height_px: "800",
      encoded_width_px: "600",
      encoded_height_px: "800",
      orientation: "1",
    },
    additionalReferences: [],
  };
}

test("accepts an explicit owner-confirmed primary drawing without changing its source descriptor", () => {
  const entry = fixture();
  const before = structuredClone(entry);
  Object.freeze(entry.mainImage);
  Object.freeze(entry.additionalReferences);
  Object.freeze(entry);
  assert.strictEqual(getDisplayReference(entry), entry.mainImage);
  assert.deepEqual(entry, before);
});

test("accepts documented EXIF rotation and either supported primary resolution", () => {
  for (const resolution of ["native_full_resolution_inspection", "limited_resolution_full_drawing_reference"]) {
    const entry = fixture();
    Object.assign(entry.mainImage, {
      inspection_resolution_class: resolution,
      orientation: "6",
      encoded_width_px: "800",
      encoded_height_px: "600",
    });
    assert.strictEqual(getDisplayReference(entry), entry.mainImage);
    assert.equal(entry.mainImage.orientation, "6");
  }
});

test("a matching work ID never promotes a proposed or partially confirmed relationship", () => {
  for (const [field, value] of [
    ["relationship_status", "proposed"],
    ["evidence_class", "deterministic_transitive_bridge"],
    ["authority_class", "derived_from_owner_confirmed_edges"],
    ["derivation_method", "transitive_closure"],
  ]) {
    const entry = fixture();
    entry.mainImage[field] = value;
    assert.equal(getDisplayReference(entry), null, field);
    delete entry.mainImage[field];
    assert.equal(getDisplayReference(entry), null, `missing ${field}`);
  }
});

test("accepts only bounded, normalized and receipt-identified owner-confirmed display derivatives", () => {
  const entry = fixture();
  Object.assign(entry.mainImage, {
    source_binding_method: "owner_confirmed_display_derivative",
    processing_method: "public_display_JPEG_bytes_unchanged",
    processing_spec: "Physical_References/Photographs/PROCESSING.json",
    inspection_resolution_class: "limited_resolution_full_drawing_reference",
    evidence_reference_id: "M002", size_bytes: "417210",
  });
  assert.strictEqual(getDisplayReference(entry), entry.mainImage);
  for (const [field, value] of [
    ["inspection_resolution_class", "native_full_resolution_inspection"],
    ["processing_method", "jpeg_metadata_only_codestream_unchanged"],
    ["source_binding_method", "exact_confirmed_source_bytes"],
    ["processing_spec", "unbound.json"], ["evidence_reference_id", ""],
    ["size_bytes", "524289"], ["size_bytes", undefined], ["orientation", "3"],
    ["width_px", "1025"], ["relationship_status", "proposed"],
  ]) {
    const changed = structuredClone(entry);
    changed.mainImage[field] = value;
    assert.equal(getDisplayReference(changed), null, field);
  }
});

test("rejects inferred exports, historical sources, and review derivatives despite owner-confirmed identity", () => {
  for (const source of ["inferred_same_capture_export_variant", "exact_historical_reference_bytes",
    "provenance_bound_review_derivative", "", undefined]) {
    const entry = fixture();
    entry.mainImage.source_binding_method = source;
    assert.equal(getDisplayReference(entry), null, source);
  }
});

test("never uses a lone supplemental photograph as a drawing reference", () => {
  const entry = fixture();
  Object.assign(entry.mainImage, {
    view_purpose: "supplemental_documentation",
    inspection_resolution_class: "supplemental_documentation",
  });
  entry.selectionStatus = "single_supplemental";
  entry.primaryReferenceCount = 0;
  assert.equal(getDisplayReference(entry), null);
  entry.selectionStatus = "primary_inspection";
  entry.primaryReferenceCount = 1;
  assert.equal(getDisplayReference(entry), null);
});

test("rejects unresolved selection and multiple primaries without choosing the confirmed candidate", () => {
  const entry = fixture();
  const secondPrimary = { ...entry.mainImage, sha256: "b".repeat(64), relationship_status: "proposed" };
  entry.additionalReferences.push(secondPrimary);
  entry.referenceCount = 2;
  entry.primaryReferenceCount = 2;
  entry.selectionStatus = "selection_unresolved";
  assert.equal(getDisplayReference(entry), null);
  entry.selectionStatus = "primary_inspection";
  assert.equal(getDisplayReference(entry), null);
  entry.primaryReferenceCount = 1;
  assert.equal(getDisplayReference(entry), null);
});

test("keeps a resolved primary eligible when supplemental evidence exists without displaying that evidence", () => {
  const entry = fixture();
  entry.additionalReferences.push({
    ...entry.mainImage,
    sha256: "b".repeat(64),
    view_purpose: "supplemental_documentation",
    inspection_resolution_class: "supplemental_documentation",
    source_binding_method: "inferred_same_capture_export_variant",
  });
  entry.referenceCount = 2;
  assert.strictEqual(getDisplayReference(entry), entry.mainImage);
});

test("rejects contradictory work, role, resolution, byte identity, and candidate counts", () => {
  for (const [field, value] of [
    ["work_id", "tlaw-fedcba9876543210"],
    ["image_role", "reverse_side"],
    ["inspection_resolution_class", "supplemental_documentation"],
    ["sha256", "not-a-source-hash"],
  ]) {
    const entry = fixture();
    entry.mainImage[field] = value;
    assert.equal(getDisplayReference(entry), null, field);
  }
  for (const [field, value] of [["referenceCount", 2], ["primaryReferenceCount", 0],
    ["additionalReferences", null], ["additionalReferences", [null]], ["workId", ""]]) {
    const entry = fixture();
    entry[field] = value;
    assert.equal(getDisplayReference(entry), null, field);
  }
});

test("requires explicit, valid EXIF metadata instead of inferring rotation from dimensions", () => {
  for (const value of [undefined, null, "", "0", "9", "1.5", "6foo", true]) {
    const entry = fixture();
    entry.mainImage.orientation = value;
    assert.equal(getDisplayReference(entry), null, String(value));
  }
  const entry = fixture();
  entry.mainImage.orientation = "6";
  assert.equal(getDisplayReference(entry), null, "EXIF rotation contradicts unswapped dimensions");
  delete entry.mainImage.orientation;
  Object.assign(entry.mainImage, { encoded_width_px: "800", encoded_height_px: "600" });
  assert.equal(getDisplayReference(entry), null, "swapped dimensions do not supply missing orientation");
});

test("rejects missing, malformed, unsafe, or contradictory encoded and displayed dimensions", () => {
  for (const field of ["width_px", "height_px", "encoded_width_px", "encoded_height_px"]) {
    for (const value of [undefined, null, "", "0", "-1", "600px", "1.5", "9007199254740992", true]) {
      const entry = fixture();
      entry.mainImage[field] = value;
      assert.equal(getDisplayReference(entry), null, `${field}=${String(value)}`);
    }
  }
  const entry = fixture();
  entry.mainImage.width_px = "800";
  assert.equal(getDisplayReference(entry), null);
});

test("handles unavailable references without creating or promoting a candidate", () => {
  for (const entry of [null, undefined, {}, { ...fixture(), mainImage: null },
    { ...fixture(), selectionStatus: "missing_public_photo" }]) {
    assert.equal(getDisplayReference(entry), null);
  }
});

test("the corrected lookup preserves the pilot and repeats the confirmed survivor for the second July 25 stage", () => {
  const source = readFileSync(new URL("../data/physical-references.json", import.meta.url), "utf8");
  const lookup = JSON.parse(source);
  const before = JSON.stringify(lookup);
  const images = Object.values(lookup.records).map(getDisplayReference).filter(Boolean);
  assert.equal(images.length, 633);
  assert.equal(images.filter((image) => image.source_binding_method === "exact_confirmed_source_bytes").length, 625);
  const displayEntries = Object.entries(lookup.records).filter(([, entry]) =>
    getDisplayReference(entry)?.source_binding_method === "owner_confirmed_display_derivative");
  assert.deepEqual(new Set(displayEntries.map(([id]) => id)), new Set([
    "tla-81af436a01eb6990", "tla-341e5c6f6373f95e", "tla-2e9770969c29eb5c", "tla-0ba66b3678db8d76",
    "tla-fc5984c94e0902f7", "tla-572e318fa8396b9f", "tla-f1909a283fd71501", "tla-f667e7cf1e5da54e",
  ]));
  assert.equal(new Set(images.map((image) => image.sha256)).size, 80);
  assert.equal(JSON.stringify(lookup), before, "eligibility must not rewrite archival source evidence");
});
