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
