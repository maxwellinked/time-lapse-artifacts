// Published additive work references; this index never changes primary-front selection.
export const REVIEWED_PHOTOGRAPHS_SHA256 = "dae3c40423e871bc1be525d2cbc8284109f12ab0993d736bccca7c0640721a35";
export const REVIEWED_PHOTOGRAPHS_REPOSITORY = "maxwellinked/time-lapse-artifacts";
const WORK = /^tlaw-[a-f0-9]{16}$/;
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const RECORD = /^tla-[a-f0-9]{16}$/;
const LINK_PATH = "Work_Identity/work_record_links.csv";
const METADATA_PATH = /^Physical_References\/Reviewed_Photographs\/\d{4}-\d{2}-\d{2}\/metadata\/photographs\.json$/;
const IMAGE_PATH = /^Physical_References\/Reviewed_Photographs\/\d{4}-\d{2}-\d{2}\/images\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.jpg$/;
const CLASSES = new Set(["owner_confirmed_work_photo_association", "creator_supplied_matching_finish_label_and_visual_corroboration"]);

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid reviewed photograph: ${message}`);
}

export function buildReviewedPhotographIndex(projection, recordData, references) {
  requireValue(projection?.schemaVersion === 1 && projection.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY &&
    recordData?.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY && references?.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY &&
    REVISION.test(projection.sourceRevision ?? "") && projection.sourceRevision === recordData.sourceRevision &&
    projection.sourceRevision === references.sourceRevision, "source snapshot mismatch");
  requireValue(projection.recordingLinks?.path === LINK_PATH && HASH.test(projection.recordingLinks.sha256 ?? "") &&
    projection.recordingLinks.sha256 === references.sourceInputs?.[LINK_PATH]?.sha256, "pinned work links mismatch");
  requireValue(Array.isArray(projection.photographs) && Array.isArray(recordData.records), "missing photograph or recording list");
  const recordIds = new Set(recordData.records.map(r => r.recordId));
  requireValue(recordIds.size === recordData.records.length && [...recordIds].every(id => RECORD.test(id)), "record membership IDs");
  const byWork = Object.create(null), byRecord = Object.create(null);
  const sourceBase = `https://huggingface.co/datasets/${REVIEWED_PHOTOGRAPHS_REPOSITORY}`;
  for (const photo of projection.photographs) {
    requireValue(WORK.test(photo.workId ?? "") && !Object.hasOwn(byWork, photo.workId), "duplicate or ambiguous work");
    requireValue(CLASSES.has(photo.evidenceClass) && typeof photo.evidenceBasis === "string" && photo.evidenceBasis.trim() &&
      photo.endpointEquality === null && photo.photographedFinalState === null && photo.selectedFrontPromoted === false &&
      typeof photo.qualification === "string" && photo.qualification.trim(), "evidence qualification");
    requireValue(IMAGE_PATH.test(photo.imagePath ?? "") && METADATA_PATH.test(photo.metadataPath ?? "") &&
      photo.imagePath.split("/images/")[0] === photo.metadataPath.split("/metadata/")[0], "source path");
    requireValue(photo.displayUrl === `reviewed-photographs/${photo.workId}.jpg` &&
      photo.fullResolutionUrl === `${sourceBase}/resolve/${projection.sourceRevision}/${photo.imagePath}` &&
      photo.sourceMetadataUrl === `${sourceBase}/blob/${projection.sourceRevision}/${photo.metadataPath}`, "image or metadata URL/path");
    requireValue(HASH.test(photo.sourceImageSha256 ?? "") && HASH.test(photo.displaySha256 ?? "") &&
      Number.isSafeInteger(photo.sourceImageSizeBytes) && photo.sourceImageSizeBytes > 0 &&
      Number.isSafeInteger(photo.displaySizeBytes) && photo.displaySizeBytes > 0 &&
      /^[1-9]\d* × [1-9]\d*$/.test(photo.displayDimensions ?? "") && Array.isArray(photo.previewDimensions) &&
      photo.previewDimensions.length === 2 && photo.previewDimensions.every(v => Number.isInteger(v) && v > 0 && v <= 1024), "image representation");
    const expected = [...recordIds].filter(id => references.records?.[id]?.workId === photo.workId).sort();
    requireValue(Array.isArray(photo.recordIds) && expected.length > 0 && photo.recordIds.length === expected.length &&
      new Set(photo.recordIds).size === photo.recordIds.length && [...photo.recordIds].sort().every((id, i) => id === expected[i]), "work membership mismatch");
    const access = Object.freeze({...photo, recordIds: Object.freeze([...photo.recordIds]), previewDimensions: Object.freeze([...photo.previewDimensions])});
    byWork[photo.workId] = access;
    for (const id of photo.recordIds) byRecord[id] = access;
  }
  return Object.freeze({byWork: Object.freeze(byWork), byRecord: Object.freeze(byRecord)});
}

export function getReviewedPhotographForRecord(index, recordId) { return index?.byRecord?.[recordId] ?? null; }
export function getReviewedPhotographForWork(index, workId) { return index?.byWork?.[workId] ?? null; }

export async function loadReviewedPhotographIndex(recordData, references, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher("data/reviewed-photographs.json", {cache: "no-store", signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`Reviewed photographs returned ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
  requireValue(hash === REVIEWED_PHOTOGRAPHS_SHA256, "projection hash mismatch");
  return buildReviewedPhotographIndex(JSON.parse(new TextDecoder().decode(bytes)), recordData, references);
}
