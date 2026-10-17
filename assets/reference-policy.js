const DIRECT_RELATIONSHIP = {
  relationship_status: "owner_confirmed",
  evidence_class: "direct_owner_confirmed",
  authority_class: "owner_direct",
  derivation_method: "direct_confirmation",
};

const PRIMARY_RESOLUTIONS = new Set([
  "native_full_resolution_inspection",
  "limited_resolution_full_drawing_reference",
]);

function positiveInteger(value) {
  if (typeof value !== "number" &&
      !(typeof value === "string" && /^[1-9][0-9]*$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function hasDocumentedOrientation(image) {
  const orientation = positiveInteger(image.orientation);
  const width = positiveInteger(image.width_px);
  const height = positiveInteger(image.height_px);
  const encodedWidth = positiveInteger(image.encoded_width_px);
  const encodedHeight = positiveInteger(image.encoded_height_px);
  if (!orientation || orientation > 8 || !width || !height || !encodedWidth || !encodedHeight) return false;
  return orientation >= 5
    ? width === encodedHeight && height === encodedWidth
    : width === encodedWidth && height === encodedHeight;
}

/**
 * Select only an unambiguous, directly owner-confirmed drawing photograph with
 * exact confirmed source bytes. Keep the source lookup unchanged as evidence.
 * EXIF describes the published photograph's display orientation; it does not
 * establish its alignment with a video or the recording's final drawing state.
 */
export function getDisplayReference(entry) {
  if (!entry || entry.selectionStatus !== "primary_inspection" ||
      !Array.isArray(entry.additionalReferences) || !entry.mainImage) return null;

  const image = entry.mainImage;
  const images = [image, ...entry.additionalReferences];
  if (images.some((candidate) => !candidate || typeof candidate !== "object" || Array.isArray(candidate)) ||
      entry.referenceCount !== images.length || entry.primaryReferenceCount !== 1 ||
      images.filter((candidate) => candidate.view_purpose === "primary_inspection").length !== 1 ||
      image.view_purpose !== "primary_inspection") return null;

  if (!/^tlaw-[a-f0-9]{16}$/.test(entry.workId ?? "") || image.work_id !== entry.workId ||
      image.image_role !== "drawing_reference" ||
      !PRIMARY_RESOLUTIONS.has(image.inspection_resolution_class) ||
      image.source_binding_method !== "exact_confirmed_source_bytes" ||
      !/^[a-f0-9]{64}$/.test(image.sha256 ?? "") ||
      Object.entries(DIRECT_RELATIONSHIP).some(([field, value]) => image[field] !== value) ||
      !hasDocumentedOrientation(image)) return null;

  return image;
}

// Access to documentation never grants primary-image or filter eligibility.
export function referenceExclusion(entry) {
  if (!entry?.workId) return ["Work link unresolved", "No established recording-to-work link is available."];
  if (!entry.referenceCount) return ["No published photograph", "This recording has an established work link, but no photograph is published in this snapshot."];
  if (entry.selectionStatus === "selection_unresolved") return ["Primary selection unresolved", "Published candidates are available in Reference details. No candidate has been selected as primary."];
  if (entry.mainImage?.view_purpose === "supplemental_documentation") return ["Supplemental documentation only", "The published photograph is designated supplemental documentation, not a primary drawing reference. Its qualified link is in Reference details."];
  if (entry.mainImage?.relationship_status === "proposed") return ["Proposed reference only", "A proposed photograph-to-work link is recorded. It does not qualify as a directly owner-confirmed primary reference. See Reference details for its evidence and source limits."];
  if (entry.mainImage?.source_binding_method === "inferred_same_capture_export_variant") return ["Qualified source variant", "The drawing identification is owner-confirmed. This file is an inferred same-capture export variant, so it is not displayed as an exact confirmed source. Its qualified link is in Reference details."];
  return ["Primary display requirements not met", "A photograph is recorded, but its selection, source binding or orientation does not meet the primary display requirements. See Reference details."];
}

export function describeReferenceLink(entry, image, evidence, sourceRevision) {
  const direct = Object.entries(DIRECT_RELATIONSHIP).every(([key, value]) => image[key] === value);
  const support = evidence?.schemaVersion === 1 && evidence.sourceRevision === sourceRevision
    ? evidence.images?.[image.sha256] : null;
  const indirect = image.relationship_status === "proposed" &&
    image.evidence_class === "deterministic_transitive_bridge" &&
    image.authority_class === "derived_from_owner_confirmed_edges" &&
    image.derivation_method === "transitive_closure" &&
    support?.workId === entry.workId && image.work_id === entry.workId &&
    Boolean(image.evidence_reference_id) && support?.referenceId === image.evidence_reference_id &&
    /^tla-[a-f0-9]{16}$/.test(support?.bridgeRecordId ?? "") &&
    /^[a-f0-9]{64}$/.test(support?.sourcePhotographSha256 ?? "");
  let title, detail;
  if (direct && image.source_binding_method === "inferred_same_capture_export_variant") {
    title = "Owner-identified drawing · inferred source variant";
    detail = "The historical photograph-to-work identification is owner-confirmed. This larger source is linked by an inferred same-capture connection, not direct owner confirmation of these source bytes.";
  } else if (direct && image.source_binding_method === "exact_confirmed_source_bytes") {
    title = "Owner-confirmed photograph";
    detail = "Direct owner identification with an exact confirmed source binding.";
  } else if (indirect) {
    title = "Supported indirect reference · status remains proposed";
    detail = "Public premises connect an owner-confirmed photograph-to-recording link to one owner-confirmed recording-to-work link. This is an indirect identification, not a new owner confirmation.";
  } else {
    title = "Proposed reference · support not verified here";
    detail = "A proposed match is recorded. A complete supporting chain for this published photograph has not been verified here; this link does not present the match as established.";
  }
  if (entry.selectionStatus === "selection_unresolved") title = `Unselected candidate · ${title}`;
  if (image.view_purpose === "supplemental_documentation") title = `Supplemental documentation · ${title}`;
  return { title, detail, supportedIndirect: Boolean(indirect),
    caution: indirect ? support.caution : "", surfaceScope: indirect ? support.surfaceScope : "" };
}
