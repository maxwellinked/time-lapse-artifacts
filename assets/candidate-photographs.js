// Qualified access to existing public DNGs; no selected image or work identity.
export const CANDIDATE_PHOTOGRAPHS_SHA256 = "078d33e059ac27502f6ad4c8040737e3c58d367f69ba0f5c55f30177b378a727";
const REVISION = '202226b18431f67f879629d8f49d72883643f810';
const REPOSITORY = 'maxwellinked/time-lapse-artifacts';
const MANIFEST_SHA256 = '8bb79930d2e0280b9d8151977644dbcac1770c79a479e09af9f539a354937865';
const HASH = /^[a-f0-9]{64}$/;
const RECORD = /^tla-[a-f0-9]{16}$/;
const METADATA = 'Image_Source_Masters/v1/Receipts/relationships.json';
const DIRECT = 'Direct cohort membership; candidate photograph relationship retained.';
const DERIVED = 'Group-derived from prior owner-confirmed recording membership; not individually listed in the later study cohort.';
const QUALIFICATION = 'Published candidate reference photograph for this recording group. It does not establish an exact recording endpoint or final state, and is not a selected primary photograph. DNG source download; no browser image is supplied.';
const EXPECTED = Object.freeze({
  '664e8776f87a4d3ca47c1ba7ac298843099070331929f5536b0bdff432e5d4b9': [
    'tla-e331a337491dcda6', 'tla-e646380c8407b8f4', 'tla-2c306a52343fe829', 'tla-b95b28799a6bedce',
    'tla-a3c2dfe3e7b14b01', 'tla-2ebf06934b96e8dd', 'tla-afcfcaf9ab1b6c16', 'tla-d9c74b9d57e1c3a7'],
  '7625f42a74ecf9c06211828489ba3eaecad00651fb7f7893df59ce41bf94e612': [
    'tla-683d766e65b70e83', 'tla-33e35be7b71f596d', 'tla-b0f113c9af61478f', 'tla-7adb8c892c296dc1', 'tla-8cd5eb5c7bacdaa9'],
});
const STUDY_SETS = Object.freeze({
  '664e8776f87a4d3ca47c1ba7ac298843099070331929f5536b0bdff432e5d4b9': 'reference_9x12',
  '7625f42a74ecf9c06211828489ba3eaecad00651fb7f7893df59ce41bf94e612': 'comparison_11x14',
});
const INPUT_PATHS = Object.freeze({
  'relationships.json': METADATA,
  'ingest-authority.json': 'Image_Source_Masters/v1/Receipts/ingest-authority.json',
  'cohort.json': 'Standard_Time_Lapses/Provenance/2026-10-30/cohort.json',
  'owner-confirmation.json': 'Standard_Time_Lapses/Provenance/2026-10-29/owner_confirmation.json',
  'ingest-mapping.json': 'Standard_Time_Lapses/Provenance/2026-10-29/ingest_mapping.json',
  'source-dispositions.json': 'Standard_Time_Lapses/Provenance/2026-10-29/source_dispositions.json',
});
function require(condition, message) { if (!condition) throw new Error(message); }

export function buildCandidatePhotographIndex(projection, recordData, references) {
  require(projection.schemaVersion === 1 && projection.sourceRepository === REPOSITORY &&
    projection.sourceRevision === REVISION && recordData.sourceRepository === REPOSITORY &&
    recordData.sourceRevision === REVISION && references.sourceRepository === REPOSITORY &&
    references.sourceRevision === REVISION && projection.sourceManifestSha256 === MANIFEST_SHA256,
    'Candidate photograph source revision or manifest mismatch');
  require(Array.isArray(projection.sourceInputs) && projection.sourceInputs.length === 6, 'Candidate source inputs missing');
  const paths = new Set();
  for (const input of projection.sourceInputs) {
    const name = Object.keys(INPUT_PATHS).find(key => INPUT_PATHS[key] === input.path);
    require(name && !paths.has(input.path) && input.retainedPath === `data/candidate-photo-source/${name}` &&
      HASH.test(input.sha256 ?? '') && Number.isSafeInteger(input.sizeBytes) && input.sizeBytes > 0, 'Invalid candidate source input');
    paths.add(input.path);
  }
  require(Array.isArray(recordData.records) && Array.isArray(projection.photographs) && projection.photographs.length === 2, 'Candidate population mismatch');
  const records = new Map(recordData.records.map(r => [r.recordId, r]));
  require(records.size === recordData.records.length, 'Duplicate browser recording ID');
  const byRecord = Object.create(null);
  const assets = new Set();
  for (const photo of projection.photographs) {
    const expected = EXPECTED[photo.sourceSha256];
    require(expected && !assets.has(photo.sourceSha256) && photo.studySetId === STUDY_SETS[photo.sourceSha256] &&
      photo.assetId === `imsrc:sha256:${photo.sourceSha256}` &&
      photo.sourcePath === `Image_Source_Masters/v1/objects/${photo.sourceSha256}.DNG` && photo.metadataPath === METADATA &&
      /^[A-Za-z0-9_.-]+\.DNG$/.test(photo.filename ?? '') && Number.isSafeInteger(photo.sizeBytes) && photo.sizeBytes > 0,
      'Invalid candidate photograph source');
    assets.add(photo.sourceSha256);
    require(photo.workId === null && photo.relationshipStatus === 'candidate_same_drawing' && photo.endpointEstablished === false &&
      photo.finalStateEstablished === false && photo.primarySelection === false && photo.qualification === QUALIFICATION,
      'Changed candidate qualification or work identity');
    require(Array.isArray(photo.records) && photo.records.length === expected.length &&
      new Set(photo.records.map(r => r.recordId)).size === expected.length && photo.records.every(r => expected.includes(r.recordId)),
      'Candidate record group differs from pinned evidence');
    for (const association of photo.records) {
      const id = association.recordId;
      const record = records.get(id);
      const reference = references.records?.[id];
      const groupDerived = id === 'tla-d9c74b9d57e1c3a7';
      require(RECORD.test(id) && record && !byRecord[id] && reference?.workId === '' &&
        reference.selectionStatus === 'missing_work_link' && reference.mainImage === null,
        'Candidate recording is unknown or has a work selection');
      require(association.associationKind === (groupDerived ? 'owner_group_derived' : 'direct_cohort') &&
        association.associationBasis === (groupDerived ? DERIVED : DIRECT), 'Candidate association basis changed');
      require(association.canonicalPath === `Standard_Time_Lapses/${record.filename}` && association.filename === record.filename &&
        /^[A-Za-z0-9_.-]+\.mp4$/.test(record.filename) &&
        record.videoUrl === `https://huggingface.co/datasets/${REPOSITORY}/resolve/${REVISION}/${association.canonicalPath}`,
        'Candidate recording source path differs');
      byRecord[id] = Object.freeze({
        downloadUrl: `https://huggingface.co/datasets/${REPOSITORY}/resolve/${REVISION}/${photo.sourcePath}`,
        filename: photo.filename, sizeBytes: photo.sizeBytes, qualification: photo.qualification,
        sourceMetadataUrl: `https://huggingface.co/datasets/${REPOSITORY}/blob/${REVISION}/${METADATA}`,
        associationBasis: association.associationBasis,
      });
    }
  }
  require(Object.keys(byRecord).length === 13, 'Candidate record coverage mismatch');
  return Object.freeze(byRecord);
}

export function getCandidatePhotographForRecord(index, id) { return index?.[id] ?? null; }

export async function loadCandidatePhotographIndex(recordData, references, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher(`data/candidate-photographs.json?v=${CANDIDATE_PHOTOGRAPHS_SHA256}`, {signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Candidate photographs unavailable');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== CANDIDATE_PHOTOGRAPHS_SHA256) throw new Error('Candidate photograph projection hash mismatch');
  return buildCandidatePhotographIndex(JSON.parse(new TextDecoder().decode(bytes)), recordData, references);
}
