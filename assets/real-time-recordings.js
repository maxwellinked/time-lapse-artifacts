// Access projection of the separately indexed real-time collection.
// Related IDs are source-declared candidates; no work or timing fields are inherited.
export const REAL_TIME_REPOSITORY = "maxwellinked/time-lapse-artifacts";
export const REAL_TIME_FIELDS = ["record_id","file_name","original_filename","sha256","hub_xet_hash","size_bytes","duration_seconds","width_px","height_px","encoded_frame_rate","video_codec","pixel_format","has_audio","time_base","nb_frames","work_id","paired_record_id","pairing_status","temporal_basis","clock_accuracy_status","source_role_status","demux_status","notes"];
const ID = /^tla-[a-f0-9]{16}$/;
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const PATH = /^Real_Time_Recordings\/\d{4}-\d{2}\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.MOV$/;
const SOURCE_PATHS = ["Real_Time_Recordings/metadata.csv", "Real_Time_Recordings/SHA256SUMS"];

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid real-time metadata: ${message}`);
}

export function realTimeSourceUrl(revision, path, view = "resolve") {
  requireValue(REVISION.test(revision), "source revision");
  requireValue(["resolve", "blob"].includes(view), "source view");
  requireValue(PATH.test(path) || [...SOURCE_PATHS,"Real_Time_Recordings/README.md","Real_Time_Recordings/SCHEMA.md"].includes(path), "source path");
  return `https://huggingface.co/datasets/${REAL_TIME_REPOSITORY}/${view}/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function validateRealTimePayload(payload, recordData) {
  requireValue(payload?.schemaVersion === 1 && payload.sourceRepository === REAL_TIME_REPOSITORY &&
    REVISION.test(payload.sourceRevision ?? "") && payload.sourceRevision === recordData?.sourceRevision,
    "source snapshot differs from the recording browser");
  requireValue(Array.isArray(payload.sourceFields) && new Set(payload.sourceFields).size === payload.sourceFields.length &&
    payload.sourceFields.every(f => typeof f === "string" && /^[a-z][a-z0-9_]*$/.test(f)) &&
    REAL_TIME_FIELDS.every(f => payload.sourceFields.includes(f)), "source fields");
  const hasSourceMode = payload.sourceFields.includes("recording_mode");
  requireValue(payload.collection === "Real_Time_Recordings" &&
    payload.recordingModeBasis === (hasSourceMode ? "source_metadata" : "documented_collection"), "collection mode basis");
  for (const path of SOURCE_PATHS) {
    const input = payload.sourceInputs?.[path];
    requireValue(HASH.test(input?.sha256 ?? "") && Number.isSafeInteger(input?.sizeBytes) && input.sizeBytes > 0, "source input binding");
  }
  requireValue(Array.isArray(payload.records) && payload.records.length > 0, "records");
  const ids = new Set((recordData.records ?? []).map(r => r.recordId));
  const paths = new Set(), hashes = new Set();
  for (const r of payload.records) {
    requireValue(r && typeof r === "object" && !Array.isArray(r) &&
      Object.keys(r).length === payload.sourceFields.length + (hasSourceMode ? 0 : 1) &&
      payload.sourceFields.every(f => Object.hasOwn(r,f) && typeof r[f] === "string"), "source values");
    requireValue(ID.test(r.record_id) && !ids.has(r.record_id), "duplicate or invalid recording ID"); ids.add(r.record_id);
    requireValue(r.recording_mode === "real_time", "recording mode");
    requireValue(PATH.test(r.file_name) && !paths.has(r.file_name), "duplicate or invalid MOV path"); paths.add(r.file_name);
    requireValue(r.original_filename.length > 0 && !/[\/\\]/.test(r.original_filename), "original filename");
    requireValue(HASH.test(r.sha256) && HASH.test(r.hub_xet_hash) && !hashes.has(r.sha256), "file identities"); hashes.add(r.sha256);
    for (const field of ["size_bytes","width_px","height_px","nb_frames"]) {
      requireValue(/^[1-9]\d*$/.test(r[field]) && Number.isSafeInteger(Number(r[field])), field);
    }
    for (const field of ["duration_seconds","encoded_frame_rate"]) {
      requireValue(/^\d+(?:\.\d+)?$/.test(r[field]) && Number.isFinite(Number(r[field])) && Number(r[field]) > 0, field);
    }
    requireValue(/^[1-9]\d*\/[1-9]\d*$/.test(r.time_base), "time base");
    requireValue(["true","false"].includes(r.has_audio), "audio stream flag");
    requireValue(r.video_codec.length > 0 && r.pixel_format.length > 0, "encoded representation");
    requireValue(r.work_id === "" || /^tlaw-[a-f0-9]{16}$/.test(r.work_id), "work identity");
    requireValue(r.paired_record_id === "" || (ID.test(r.paired_record_id) && r.paired_record_id !== r.record_id), "related recording ID");
    for (const field of ["pairing_status","temporal_basis","clock_accuracy_status","source_role_status","demux_status"]) {
      requireValue(/^[a-z][a-z0-9_]*$/.test(r[field]), field);
    }
  }
  return payload;
}

export function relatedRealTimeRecords(payload, recordId) {
  return payload.records.filter(r => r.paired_record_id === recordId);
}

export async function loadRealTimeMetadata(recordData, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl("data/real-time-recordings.json", {cache:"no-store", signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`Real-time index returned ${response.status}`);
  return validateRealTimePayload(await response.json(), recordData);
}

export function createRelatedRecordingsController({load, show}) {
  let generation = 0;
  return {
    async open(recordId) {
      const ticket = ++generation;
      show({state:"loading", recordId, records:[]});
      try {
        const payload = await load();
        if (ticket === generation) show({state:"ready", recordId, records:relatedRealTimeRecords(payload, recordId)});
      } catch {
        if (ticket === generation) show({state:"unavailable", recordId, records:[]});
      }
    },
    clear() { generation++; },
  };
}

export function realTimeStatusLabel(value) {
  return ({candidate_not_calibrated:"Candidate; timing not calibrated", encoded_media_timeline:"Encoded media timeline",
    not_externally_calibrated:"Not externally calibrated", not_independently_verified_as_camera_original:"Camera-original status not independently verified",
    passed_no_logged_errors:"No logged errors in the recorded demux check", completed_with_timestamp_errors:"Completed with timestamp errors"})[value] ?? value;
}
