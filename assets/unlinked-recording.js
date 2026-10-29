// A blank identity is an explicit source state, never a synthetic drawing ID.
export function isUnlinkedRecording(entry) {
  return entry?.workId === "" && entry.selectionStatus === "missing_work_link" &&
    entry.referenceRole === "missing" && entry.clarification === "" &&
    entry.referenceCount === 0 && entry.primaryReferenceCount === 0 &&
    entry.mainImage === null && Array.isArray(entry.additionalReferences) &&
    entry.additionalReferences.length === 0;
}
