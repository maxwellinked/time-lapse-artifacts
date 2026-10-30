import { loadPhotographDownloads } from "./photograph-downloads.js?v=photo-selections-2890eef05c0c-1c1c5a299eac";
import { isUnlinkedRecording } from "./unlinked-recording.js?v=20261029-unlinked-recordings";
// Current source-registry projection; historical candidate evidence retains its original pins.
export const SELECTED_FRONTS_SHA256 = "a752d9228944667f733c3c501aa67f1b2cf6d2d7e0b51c8c790c492ae91e6684";
export const LEGACY_REFERENCE_SHA256 = "7424b2de2612b02301b822657ce68a3e3afa314849bbbedc4d44ecd943f83808";
export const PHOTO_SELECTION_REGISTRY_SHA256 = "1c1c5a299eac0990fac974caf41bd46d0f759e53cd2a48b5a62b587dfe6d8958";
export const PHOTO_SELECTION_SOURCE_REVISION = "2890eef05c0ce32b731fb0cf45952dff6141273b";
const HASH = /^[a-f0-9]{64}$/;
const WORK = /^tlaw-[a-f0-9]{16}$/;
const LINK_PATH = "Work_Identity/work_record_links.csv";

export function buildSelectedFrontIndex(projection, recordData, references) {
  const source = projection.selection_registry;
  if (source?.repository !== "maxwellinked/time-lapse-artifacts" ||
      source.path !== "Physical_References/Selected_Front_Downloads/selections.json" ||
      source.sha256 !== PHOTO_SELECTION_REGISTRY_SHA256 || source.revision !== PHOTO_SELECTION_SOURCE_REVISION) {
    throw new Error("Selected fronts differ from the authoritative photo registry");
  }
  if (recordData.sourceRepository !== "maxwellinked/time-lapse-artifacts" ||
      references.sourceRevision !== recordData.sourceRevision ||
      projection.recording_links?.path !== LINK_PATH ||
      projection.recording_links.sha256 !== references.sourceInputs?.[LINK_PATH]?.sha256 ||
      !HASH.test(projection.recording_links.sha256 ?? "") ||
      !HASH.test(projection.selection_map_sha256 ?? "") ||
      !HASH.test(projection.candidate_table_sha256 ?? "")) throw new Error("Selected fronts differ from the pinned work links");
  const activeWorks = new Set();
  const recordIds = new Set();
  for (const record of recordData.records) {
    const entry = references.records?.[record.recordId];
    const workId = entry?.workId;
    if (recordIds.has(record.recordId)) throw new Error("Invalid recording-to-work link");
    recordIds.add(record.recordId);
    if (isUnlinkedRecording(entry)) continue;
    if (!WORK.test(workId ?? "")) throw new Error("Invalid recording-to-work link");
    activeWorks.add(workId);
  }
  const unselected = projection.unselected_work_ids ?? [];
  if (!Array.isArray(unselected) || new Set(unselected).size !== unselected.length ||
      unselected.some(workId => !WORK.test(workId) || !activeWorks.has(workId))) {
    throw new Error("Invalid unselected-work coverage");
  }
  if (Object.keys(references.records).length !== recordIds.size ||
      !Array.isArray(projection.selections) || projection.selections.length + unselected.length !== activeWorks.size) {
    throw new Error("Selected-front coverage differs from the recording index");
  }
  const byWork = Object.create(null);
  for (const selection of projection.selections) {
    const workId = selection.work_id;
    if (!activeWorks.has(workId) || unselected.includes(workId) || byWork[workId] || selection.photo_role !== "front" ||
        !HASH.test(selection.source_photograph_sha256 ?? "") ||
        !HASH.test(selection.display?.output_display_sha256 ?? "")) throw new Error("Invalid selected front");
    byWork[workId] = Object.freeze({workId, displayUrl: `selected-fronts/${workId}.jpg`,
      displaySha256: selection.display.output_display_sha256,
      sourcePhotographSha256: selection.source_photograph_sha256,
      downloadRepresentation: Object.freeze({...selection.download}), orientationNormalized: true});
  }
  const byRecord = Object.create(null);
  for (const recordId of recordIds) {
    const selected = byWork[references.records[recordId].workId];
    if (selected) byRecord[recordId] = selected;
  }
  return Object.freeze({byWork: Object.freeze(byWork), byRecord: Object.freeze(byRecord),
    selectionRegistry: Object.freeze({...source}), unselectedWorkIds: Object.freeze([...unselected])});
}

export function getSelectedFrontForRecord(index, recordId) { return index?.byRecord?.[recordId] ?? null; }
export function getSelectedFrontForWork(index, workId) { return index?.byWork?.[workId] ?? null; }

export function applySelectedFronts(works, index) {
  return works.map(work => {
    const selectedFront = getSelectedFrontForWork(index, work.workId);
    if (!selectedFront) {
      if (!index.unselectedWorkIds.includes(work.workId)) throw new Error("Drawing missing from selected-front coverage");
      return {...work, selectedFront: null};
    }
    return {...work, selectedFront, displayUrl: selectedFront.displayUrl, displaySha256: selectedFront.displaySha256};
  });
}

export async function loadSelectedFrontIndex(recordData, references, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher(`data/selected-fronts.json?v=${SELECTED_FRONTS_SHA256}`, {signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error("Selected fronts unavailable");
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(value => value.toString(16).padStart(2,"0")).join("");
  if (hash !== SELECTED_FRONTS_SHA256) throw new Error("Selected-front projection hash mismatch");
  const index = buildSelectedFrontIndex(JSON.parse(new TextDecoder().decode(bytes)), recordData, references);
  try { return await loadPhotographDownloads(index, fetcher, crypto); }
  catch (error) { console.warn("Photograph download links unavailable", error); return index; }
}
