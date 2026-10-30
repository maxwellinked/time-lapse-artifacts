const REGISTRY_PATH = "Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json";
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const INSERTION_SUFFIX = /\.Rec\d{2,}[a-z]+\.mp4$/i;
function require(condition, message) { if (!condition) throw new Error(`Invalid sequence insertion projection: ${message}`); }
function binding(value, expectedPath) {
  require(value && typeof value.path === "string" && SHA256.test(value.sha256), "missing path/hash binding");
  require(value.path === expectedPath, "unexpected source path");
}
export function validateSequenceInsertions(projection, records, sourceRevision) {
  const insertionRecords = records.filter(r => INSERTION_SUFFIX.test(r.filename));
  if (projection === null || projection === undefined) {
    require(insertionRecords.length === 0, "insertion records require an explicit projection");
    return null;
  }
  require(projection.schemaVersion === 1 && Array.isArray(projection.sequences), "unsupported schema");
  require(REVISION.test(sourceRevision) && projection.sourceHubRevision === sourceRevision, "source revision differs");
  binding(projection.sourceRegistry, REGISTRY_PATH);
  const byId = new Map(records.map(r => [r.recordId, r]));
  const usedIds = new Set(), groups = new Set(), paths = new Set();
  for (const sequence of projection.sequences) {
    const label = sequence.fragmentSetLabel;
    require(typeof label === "string" && label.length > 0 && !groups.has(label), "duplicate or missing sequence label");
    groups.add(label);
    const path = sequence.sourceManifest?.path;
    require(typeof path === "string" && /^Standard_Time_Lapses\/Provenance\/Sequence_Insertions\/[A-Za-z0-9-]+\/sequence\.json$/.test(path) && !paths.has(path), "duplicate or invalid sequence manifest path");
    binding(sequence.sourceManifest, path); paths.add(path);
    const evidence = sequence.evidence;
    require(evidence?.membership === "owner-confirmed" && evidence.order === "visual-inference-with-device-metadata-corroboration" && evidence.gapless_capture === "not-established" && sequence.sequenceCompleteness === "unknown", "unsupported evidence or completeness claim");
    require(Array.isArray(sequence.recordIds) && sequence.recordIds.length > 1, "missing sequence members");
    const groupRecords = records.filter(r => r.filename.startsWith(`${label}.Rec`));
    require(groupRecords.length === sequence.recordIds.length, "sequence member count differs");
    let lastKey = 0, insertions = 0;
    for (const id of sequence.recordIds) {
      const record = byId.get(id);
      require(record && !usedIds.has(id), "unknown or duplicate sequence member"); usedIds.add(id);
      require(record.filename.startsWith(`${label}.Rec`), "member belongs to another sequence");
      const suffix = record.filename.slice(`${label}.Rec`.length).match(/^(\d{2,})([ab]?)\.mp4$/);
      require(suffix, "unregistered sequence suffix");
      const number = Number(suffix[1]);
      const key = number * 10 + (suffix[2] ? suffix[2].charCodeAt(0) - 96 : 0);
      require(number > 0 && key > lastKey, "sequence order contradicts retained member order or insertion anchors");
      if (suffix[2]) { require(number === 3, "unregistered insertion anchor"); insertions += 1; }
      lastKey = key;
    }
    require(insertions === 2, "sequence must bind both registered insertion members");
  }
  require(insertionRecords.every(r => usedIds.has(r.recordId)), "insertion member missing from projection");
  return projection;
}
export async function loadSequenceInsertions(url, records, sourceRevision, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  // Historical indexes with no insertions predate the supplement. Every other
  // HTTP/network/JSON failure is visible; a failed supplement is never ignored.
  const projection = response.status === 404 ? null : await (async () => {
    require(response.ok, `HTTP ${response.status}`); return response.json();
  })();
  return validateSequenceInsertions(projection, records, sourceRevision);
}
