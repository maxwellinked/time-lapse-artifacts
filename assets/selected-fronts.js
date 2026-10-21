// Generated display projection of the existing selected-front map; no source-evidence edits.
export const SELECTED_FRONTS_SHA256 = "d44b29cd2b782ef38ab15310218dacb73891bbe95d9f9c5f4e30354bdfe8e034";
export const LEGACY_REFERENCE_SHA256 = "d2136d00b0a8515113fcc020144dbd9d460274aacb24b5f97d36e96ce395f03c";
const HASH = /^[a-f0-9]{64}$/;
const WORK = /^tlaw-[a-f0-9]{16}$/;
const LINK_PATH = "Work_Identity/work_record_links.csv";

export function buildSelectedFrontIndex(projection, recordData, references) {
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
    const workId = references.records?.[record.recordId]?.workId;
    if (!WORK.test(workId ?? "") || recordIds.has(record.recordId)) throw new Error("Invalid recording-to-work link");
    activeWorks.add(workId); recordIds.add(record.recordId);
  }
  if (Object.keys(references.records).length !== recordIds.size ||
      !Array.isArray(projection.selections) || projection.selections.length !== activeWorks.size) {
    throw new Error("Selected-front coverage differs from the recording index");
  }
  const byWork = Object.create(null);
  for (const selection of projection.selections) {
    const workId = selection.work_id;
    if (!activeWorks.has(workId) || byWork[workId] || selection.photo_role !== "front" ||
        !HASH.test(selection.source_photograph_sha256 ?? "") ||
        !HASH.test(selection.display?.output_display_sha256 ?? "")) throw new Error("Invalid selected front");
    byWork[workId] = Object.freeze({workId, displayUrl: `selected-fronts/${workId}.jpg`,
      displaySha256: selection.display.output_display_sha256,
      sourcePhotographSha256: selection.source_photograph_sha256,
      orientationNormalized: true});
  }
  const byRecord = Object.create(null);
  for (const recordId of recordIds) byRecord[recordId] = byWork[references.records[recordId].workId];
  return Object.freeze({byWork: Object.freeze(byWork), byRecord: Object.freeze(byRecord)});
}

export function getSelectedFrontForRecord(index, recordId) { return index?.byRecord?.[recordId] ?? null; }
export function getSelectedFrontForWork(index, workId) { return index?.byWork?.[workId] ?? null; }

export async function loadSelectedFrontIndex(recordData, references, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher("data/selected-fronts.json", {signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error("Selected fronts unavailable");
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(value => value.toString(16).padStart(2,"0")).join("");
  if (hash !== SELECTED_FRONTS_SHA256) throw new Error("Selected-front projection hash mismatch");
  return buildSelectedFrontIndex(JSON.parse(new TextDecoder().decode(bytes)), recordData, references);
}
