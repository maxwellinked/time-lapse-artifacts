import { getDisplayReference } from "./reference-policy.js";

// Presentation grouping only: the recording lookup supplies the existing work IDs.
export function buildDrawingArchive(recordData, references, previews) {
  if (!recordData.sourceRevision || references.sourceRevision !== recordData.sourceRevision ||
      previews.sourceRevision !== recordData.sourceRevision) throw new Error("Drawing inputs have different source revisions");
  const records = recordData.records;
  const ids = new Set(records.map((record) => record.recordId));
  if (ids.size !== records.length || Object.keys(references.records).length !== ids.size ||
      Object.keys(references.records).some((id) => !ids.has(id))) throw new Error("Drawing lookup coverage differs from the recording index");
  const works = new Map();
  for (const record of records) {
    const entry = references.records[record.recordId];
    if (!/^tlaw-[a-f0-9]{16}$/.test(entry?.workId ?? "")) throw new Error("Recording has no established work ID");
    const work = works.get(entry.workId) ?? { workId: entry.workId, records: [], entries: [] };
    work.records.push(record);
    work.entries.push(entry);
    works.set(work.workId, work);
  }
  return [...works.values()].map(({ workId, records, entries }) => {
    const candidates = entries.map(getDisplayReference);
    const image = candidates[0];
    const consistent = image && candidates.every((candidate) => candidate &&
      JSON.stringify(candidate) === JSON.stringify(image));
    let photograph = null;
    let displayUrl = null;
    let displaySha256 = null;
    let status = entries.every((entry) => entry.referenceCount === 0)
      ? "no_published_photograph" : "reference_review";
    if (consistent) {
      const expectedUrl = `https://huggingface.co/datasets/${recordData.sourceRepository}/resolve/${recordData.sourceRevision}/${image.image_path}`;
      if (image.fullResolutionUrl !== expectedUrl || !image.image_path.startsWith("Physical_References/Photographs/images/") ||
          image.image_path.includes("..")) throw new Error("Unexpected photograph source URL");
      if (Math.max(Number(image.width_px), Number(image.height_px)) <= 1024 &&
          Number(image.size_bytes) > 0 && Number(image.size_bytes) <= 512 * 1024) {
        displayUrl = image.fullResolutionUrl;
        displaySha256 = image.sha256;
      } else {
        const preview = previews.images?.[image.sha256];
        if (preview?.sourceUrl === image.fullResolutionUrl && /^[a-f0-9]{64}$/.test(preview.sha256 ?? "") &&
            preview.width > 0 && preview.height > 0 && Math.max(preview.width, preview.height) <= 1024 &&
            preview.sizeBytes > 0 && preview.sizeBytes <= 512 * 1024) {
          displayUrl = `reference-previews/${image.sha256}.jpg`;
          displaySha256 = preview.sha256;
        }
      }
      status = displayUrl ? "confirmed_photograph" : "display_unavailable";
      if (displayUrl) photograph = image;
    }
    return { workId, records, photograph, displayUrl, displaySha256, status };
  });
}
