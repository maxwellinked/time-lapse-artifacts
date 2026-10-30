import { validateSequenceInsertions } from "./sequence-insertions.js";

const RECORDING_PART_PATTERN = /\.Rec(\d{2,})\.mp4$/i;
const RECORDING_DESCRIPTOR_PATTERN =
  /^\d{4}-\d{2}-\d{2}\.(?:\d{4}|UnknownTime)\.(.+)\.Rec\d{2,}\.mp4$/i;

function timestamp(record) {
  return `${record.date}T${record.time ?? "00:00"}`;
}

function descriptor(filename) {
  return String(filename ?? "").match(RECORDING_DESCRIPTOR_PATTERN)?.[1].toLowerCase() ?? null;
}

export function getRecordingPart(filename) {
  const match = String(filename ?? "").match(RECORDING_PART_PATTERN);
  if (!match) return null;

  const number = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(number) || number < 1) return null;

  return {
    number,
    label: `REC ${String(number).padStart(2, "0")}`,
  };
}

export function deriveRecordingSequences(records, projection = null, sourceRevision) {
  validateSequenceInsertions(projection, records, sourceRevision);
  // Presentation heuristic only: filename continuity does not establish work identity,
  // session identity, or completeness.
  const details = new Map();
  const ordered = records
    .filter((record) => Number.isInteger(record.rowIndex))
    .slice()
    .sort((a, b) => a.rowIndex - b.rowIndex);

  records.forEach((record) => {
    const part = getRecordingPart(record.filename);
    if (part) details.set(record.recordId, { ...part, groupId: null, sequenceSize: null });
  });

  for (let index = 0; index < ordered.length; index += 1) {
    const first = ordered[index];
    if (getRecordingPart(first.filename)?.number !== 1) continue;

    const run = [first];
    const firstDescriptor = descriptor(first.filename);
    let previous = first;
    let expectedPart = 2;
    let cursor = index + 1;

    while (cursor < ordered.length) {
      const candidate = ordered[cursor];
      const candidatePart = getRecordingPart(candidate.filename);
      if (
        !firstDescriptor ||
        descriptor(candidate.filename) !== firstDescriptor ||
        candidate.rowIndex !== previous.rowIndex + 1 ||
        candidatePart?.number !== expectedPart
      ) {
        break;
      }

      run.push(candidate);
      previous = candidate;
      expectedPart += 1;
      cursor += 1;
    }

    if (run.length < 2) continue;

    const groupId = `recording-sequence:${first.recordId}`;
    run.forEach((record, position) => {
      const part = getRecordingPart(record.filename);
      details.set(record.recordId, {
        ...part,
        groupId,
        sequenceSize: run.length,
        sequencePosition: position + 1,
      });
    });
    index = cursor - 1;
  }

  for (const sequence of projection?.sequences ?? []) {
    sequence.recordIds.forEach((id, index) => {
      details.set(id, {
        ...getRecordingPart(records.find(record => record.recordId === id).filename),
        groupId: `explicit-sequence:${sequence.fragmentSetLabel}`,
        sequencePosition: index + 1,
        sequenceSize: sequence.recordIds.length,
        explicit: true,
        label: `Position ${index + 1} of ${sequence.recordIds.length}; inferred order; completeness unknown`,
        evidence: sequence.evidence,
      });
    });
  }
  return details;
}

export function sortRecordsForDisplay(records, order, sequenceDetails) {
  const units = new Map();

  records.forEach((record, originalIndex) => {
    const detail = sequenceDetails.get(record.recordId);
    const key = detail?.groupId ?? `record:${record.recordId}`;
    if (!units.has(key)) units.set(key, { firstIndex: originalIndex, records: [] });
    units.get(key).records.push(record);
  });

  const orderedUnits = [...units.values()].map((unit) => {
    unit.records.sort((a, b) => {
      const aPart = sequenceDetails.get(a.recordId);
      const bPart = sequenceDetails.get(b.recordId);
      return (aPart?.sequencePosition ?? aPart?.number ?? 0) -
        (bPart?.sequencePosition ?? bPart?.number ?? 0);
    });

    const timestamps = unit.records.map(timestamp);
    unit.anchor = order === "asc" ? timestamps.sort()[0] : timestamps.sort().at(-1);
    return unit;
  });

  orderedUnits.sort((a, b) => {
    const comparison = a.anchor.localeCompare(b.anchor);
    if (comparison) return order === "asc" ? comparison : -comparison;
    return a.firstIndex - b.firstIndex;
  });

  return orderedUnits.flatMap((unit) => unit.records);
}

export function extendVisibleCount(records, requestedCount, sequenceDetails) {
  let count = Math.min(Math.max(0, requestedCount), records.length);
  if (count === 0 || count === records.length) return count;

  const groupId = sequenceDetails.get(records[count - 1].recordId)?.groupId;
  if (!groupId) return count;

  while (
    count < records.length &&
    sequenceDetails.get(records[count].recordId)?.groupId === groupId
  ) {
    count += 1;
  }

  return count;
}
