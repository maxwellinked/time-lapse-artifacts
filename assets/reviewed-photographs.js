// Published additive work references; this index never changes primary-front selection.
export const REVIEWED_PHOTOGRAPHS_SHA256 = "dae3c40423e871bc1be525d2cbc8284109f12ab0993d736bccca7c0640721a35";
export const REVIEWED_PHOTOGRAPHS_REPOSITORY = "maxwellinked/time-lapse-artifacts";
const WORK = /^tlaw-[a-f0-9]{16}$/;
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const RECORD = /^tla-[a-f0-9]{16}$/;
const LINK_PATH = "Work_Identity/work_record_links.csv";
const HISTORICAL_SOURCE_REVISION = "202226b18431f67f879629d8f49d72883643f810";
const HISTORICAL_WORK_LINK_SHA256 = "89e7c62713fb4f260551bf165047074f7437892db25c03f7b3b274f6394c2d3c";
const RECORDING_INTEGRITY = Object.freeze({
  "tla-05a460908ef37606": "fa8b623af019c91c1e74a5b2fc4e8ef9c08c33f269e01e39c91ebb1e362652a7",
  "tla-0b233acf16436cc4": "ea2132b19ae1e0feefa528dddd57885cd6684e91c1cd2fbeccc288e000b87d9f",
  "tla-115399816f9d28c1": "9259806e8d67998f94735dc20c4165b26cc865a7993ca1e13a7d5b19862b95eb",
  "tla-11e99bba799ac5be": "55a180bb26cd90d539ab40bd2d66910dcbc4ea22ebe70e9eab6e039d6c913287",
  "tla-181739297f23e9df": "e7686d228c32bc69149e0e9f9c8a8b94d36fa2aee15270e049cbd10620e9559c",
  "tla-18348819aa050171": "2df6607ec8a24f72c4b50170ee63c886f5f2897cd7f7acd6ba079626c4f6adc6",
  "tla-19e9fadad38a0b5a": "361da0ea31069eb3e9f760217fb4090d69369a4ed50befe6b8483ea196b00c8c",
  "tla-1b96428246886abf": "55d1e931575c9ff2c90980e64fcb76c76ea9ad8f9dd82225948c6f46d05d2041",
  "tla-1ca2b83d9b54d55a": "5eb79175a42b8f5cf0924e67d52aefe5fd1e7f3f27ee177221c8ab882ca82e3f",
  "tla-253cff3e92135599": "0ea4e8646bd97c3267789f6e3f515fba76fac3930ea991d5a383c5baf5718c86",
  "tla-28494b3b4805006f": "089121d7e902986f93a586e6b1c56ec8fdaa0008bb5943b8d23ca6a37ed8ab5e",
  "tla-2984be965b28cbda": "6758268d40039ba875e24190dba29a6690b07d62160f13af9fc1f01ef7e22140",
  "tla-2e2d444b8ab4a7bb": "2dbbc7e0d9f2da9906811f2e25270f716da5fdbbfad600f3491c873f90b2ee71",
  "tla-2f63cb08b6ab786a": "0dcfc0c5bd0359a06bab102d521d3ee43739372f05e24e5583a68a4ead882c8a",
  "tla-2fa54dbab1a3a47e": "cbf88503b3989158f271d1a031ba23936fa5955224af6494a2cd5de1cdae688b",
  "tla-334d52d4b73b5151": "d6a9fc550fe449641c7f7ec317213fccb1f1cb92db23126e0835cc327707463b",
  "tla-34e568c0b4443a73": "643f7da0674a8ddcb2140706148c05f9e7b859764df51c870064a96d54b12a1c",
  "tla-35ef9e6d3f9cdc88": "a93d58bba4ff31043632368a23dc9a0881be94f490a11dc52e1dfb7e3c811484",
  "tla-37bc7c4ed1ec87ea": "1a43ad310e101a114486e3a6bf79a27dd58da5654b33df87c4d245671cb42bf3",
  "tla-3c32c0caf4a7c777": "11eb94ecaf544a45f071c12298e914c0aa64c527067525f91acddcc541e37462",
  "tla-3d337f43c61fa701": "c408108f3817ad056246513798f6d5c785e2cc90bf99f80c762f808c6a0964ba",
  "tla-41667b16a88d464a": "e817199e880289426a599e67f25732fa347b62d5196bad94d9a17387c7755f4b",
  "tla-58cbef8409b84538": "73fc634d7fe1195253007bd723e89369d37effd2b85f65941902263b0a8f90a8",
  "tla-5a7a3a330d769145": "0124837adc78e2d2316ac0ca21d2667f440e806d975f964816251d4df121877f",
  "tla-5e7dfda7b1e2fccf": "c322d2109319655f56b4fba513c5defce695c56fa80aa5e98deafb235edc226a",
  "tla-5f64f161d0b661a7": "32aef7ddb09d9e30a47e22721b519d11ddc9341a85873114e57065cfb5c449ee",
  "tla-640e0580b0112de3": "98d61615702ce074b530444a331c9ebae23b215673e8335bd156485a368f1e98",
  "tla-6a3102bc60245d50": "4f0bc4380d504e8993e3ed8de4e27a1b21474eebb89c1c951fc750e4518e697c",
  "tla-6add4c72aa8e9c09": "bde269aa21f108238fed320512b4dfc715e0f64573544f840b0e39d08885b93c",
  "tla-6d925228bf5911fb": "ca6a87fea046bdf31ba7ed13688b38343a4baaec22b29d527af346822d6fcb00",
  "tla-6e73e579c6b741bc": "a5452539d07ae1af2bc32727699b9ad8ef58d7acf48bec1f4aaa54251918b4fa",
  "tla-6eaf262a69dbd4aa": "cd414f016547688b6798bcef14dc8bdd6dad248f5548f19b688575c68d7c8ece",
  "tla-71cca05bd5e8fc56": "918c7ec2a5cf69e05f1d1e7e43bcf7b1cb071ec499f713ea7725ba0a9e881dea",
  "tla-740dd7c948d9b1ef": "14ef3813d9748f4ad9aab8e74cde2ea47989b06a62e360bfd5f1fa5519672430",
  "tla-747a528383b1724a": "1d66dcea1c19efcadd04818e058ab08940ba1128d589d7c4ad39d9eee14d9988",
  "tla-7519977d0db6c308": "671f698b332c98baf609d7d6db2b94ab871ac616f79f48693792d7842521341f",
  "tla-75b33f1aa082de29": "999459ed06db2bc6a8b09970f4271ae355accd8621c973c26429ad91368017aa",
  "tla-795f9203a7081259": "51c8b3bc2f13c370a161a109cb24ea80c66b4eb03a1b93f7cbd0992cbd287e84",
  "tla-7a0a33accd726e7c": "9202abe6974ee93e1d81b3b6f96650a67c0e498617982797ccd407a603003292",
  "tla-7ce705e10a8474a5": "1f81556717103b6238aa83903569ee424827f2dae0673020056f3c9d1b98134c",
  "tla-83d4d7908a2d8e80": "ea54ba63d2c4a7701b3092e46687f829c0d75cae242c966ddc230f87b605e29c",
  "tla-856f322121551bcd": "bc7ad4f7b61113553779cc0eb3b1aaef5924860f2a4c181d21d0936389e84e20",
  "tla-98a0865acc4666a3": "6fa28a905aaf8d666ac634c42626426bc46f31dc4f31d69a3664862dd3f93a3a",
  "tla-9eb2da077885319e": "448cc1fee10c9b85f0bacf93daea5f8b86455078a49bf47346f88cb3cf0c469c",
  "tla-a36304c7a6001eda": "27e8ff8035395037e81b843284324c814911404544f0c50925c76cb1aeac2689",
  "tla-a4e02d70b52ad726": "b9f6460212d2f11536f905f26231ba9f2125011bd89014e0c37edd2881057117",
  "tla-a7184b9da9e38c5d": "03634aa616d5cad65382d0e4e8f82a35590c677e121008c0f29683f97dd88af9",
  "tla-aaa4c20e5c6d9c23": "ee6716c07b7214a8fc3df29037deffbdae84f2f65b639892385a700c65efd7b6",
  "tla-b521674b626db9b0": "f2c038fbe9b4fb9945347a83efd7aeabeacbb4e3d8f85d43043b3ddf4038e60b",
  "tla-b73ee775f4b1d302": "4cd32793c4d2463d21d766ca4bf23249c9471b7a0da3a3a8a706d7bd244801ee",
  "tla-b81a710ad182c8d8": "8b05146c88eba3de586e79e41f65a0cf1b67a5a1b0f5dd005aa80e6a54168437",
  "tla-bdb85295f6d50723": "f2ee4fd5e22af7eec1124cc93adbb7fd564ddae206f9e80ecab8d2c3e14d7d97",
  "tla-c9e3575e1657f9fe": "edd3c27278fbfc711eeed9e410dec83996082068a230bbc482d5fe3cb2b85009",
  "tla-d04ca16214042232": "0897bcccedeed708a103cbc17e1f2ff7c31adcbc28befcf1d5bcddaf3fb8d391",
  "tla-d838fc7198034e51": "b77ada70a20147d77e1f05f65c64c285305861c1fac6ec45ad9163b594cca814",
  "tla-dd447e244e5aa5a4": "8c5c50c2d5b53f11e2b45004446d03392f61f98f46f39e489d1e4afb24f4b23b",
  "tla-ded8057966ddfd6b": "4659e1d37d62b8f0326f59a46add1f387f9462e71a75dd082c94d99449f5d3c5",
  "tla-e523c92ad4ee332f": "8c290fbde87155e12788a4c1ff91797c9233de419cca34f2eb48db2db6e24a49",
  "tla-e5c3c298c352f296": "22764aa60b4a10720d19ebe0fd983e7ba7147d7fe59efc025b18c0a4bffbcf25",
  "tla-e60cb377358cb8d5": "edbb4035b4b1f869b7ec310d8ffcc87313d85c741c1f1f970bad8946032ab17d",
  "tla-e85fda68129ca943": "457b996a5800e2c7addae7649e0d130a560c36d7927a60e2673069eb23325da9",
  "tla-e8fa3a3888616943": "ad0e0ca4ab00d2b462d6f8265542d0cec3751b88480b9e5acf33957de8c2afb2",
  "tla-eac3d49e60c6dbe9": "7130dfb9d34714411fa0aca46a06914894a2ead0d543048cf74cd20ccb3c2fb5",
  "tla-ec85866c0d06f829": "04ea9a5c32e852cbf2a4223fdf2b9a06d97b4a41b2138de7a25f98144673dda6",
  "tla-edd1626af894b182": "859b316870c455c9484d96252ad0d77102cb664bb714a174c294af30de8978cc",
  "tla-ee0dd4abcf4f85a2": "86a66176cf4feeb1b61463b84a54d506586e3d537a7b86fa367eae8b63326e25",
  "tla-f38f86b027363807": "18c0b257e97c8f30e41e00cf02c322a757cfa79fed6a7b35f4cba134586cf2eb",
  "tla-f43f562de8d027ed": "0a0bd05eff4a9acb54a68d5ff2381a6ef81b77212e58bbe783d361487a846206",
  "tla-fa4f33c77e515fd2": "3d08d456e7b36418bf6e56161bc47c439de206c936d9f7d29da0c73b624b664c",
  "tla-fd8c2010685d6126": "8a2e77174b45907b4b54e4d96fa1e48f8954f50f8830e319e0209f73a4923548"
});
const METADATA_PATH = /^Physical_References\/Reviewed_Photographs\/\d{4}-\d{2}-\d{2}\/metadata\/photographs\.json$/;
const IMAGE_PATH = /^Physical_References\/Reviewed_Photographs\/\d{4}-\d{2}-\d{2}\/images\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.jpg$/;
const CLASSES = new Set(["owner_confirmed_work_photo_association", "creator_supplied_matching_finish_label_and_visual_corroboration"]);

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid reviewed photograph: ${message}`);
}

export function buildReviewedPhotographIndex(projection, recordData, references) {
  requireValue(projection?.schemaVersion === 1 && projection.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY &&
    projection.sourceRevision === HISTORICAL_SOURCE_REVISION, "historical source snapshot mismatch");
  const currentRevision = recordData?.sourceRevision;
  requireValue(recordData?.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY &&
    references?.sourceRepository === REVIEWED_PHOTOGRAPHS_REPOSITORY && REVISION.test(currentRevision ?? "") &&
    currentRevision === references.sourceRevision, "current source snapshot mismatch");
  requireValue(projection.recordingLinks?.path === LINK_PATH &&
    projection.recordingLinks.sha256 === HISTORICAL_WORK_LINK_SHA256, "historical work links mismatch");
  const currentLinks = references.sourceInputs?.[LINK_PATH];
  requireValue(currentLinks?.path === LINK_PATH && currentLinks.revision === currentRevision &&
    HASH.test(currentLinks.sha256 ?? "") &&
    (currentRevision !== HISTORICAL_SOURCE_REVISION || currentLinks.sha256 === HISTORICAL_WORK_LINK_SHA256),
    "current work links mismatch");
  requireValue(Array.isArray(projection.photographs) && Array.isArray(recordData.records), "missing photograph or recording list");
  const records = new Map(recordData.records.map(r => [r.recordId, r]));
  requireValue(records.size === recordData.records.length && [...records.keys()].every(id => RECORD.test(id)), "record membership IDs");
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
    const expected = [...records.keys()].filter(id => references.records?.[id]?.workId === photo.workId).sort();
    requireValue(Array.isArray(photo.recordIds) && expected.length > 0 && photo.recordIds.length === expected.length &&
      new Set(photo.recordIds).size === photo.recordIds.length && [...photo.recordIds].sort().every((id, i) => id === expected[i]), "work membership mismatch");
    for (const id of photo.recordIds) {
      const record = records.get(id);
      requireValue(Object.hasOwn(RECORDING_INTEGRITY, id) && record.integrityReference === RECORDING_INTEGRITY[id],
        "recording integrity mismatch");
      requireValue(/^[A-Za-z0-9_.-]+\.mp4$/.test(record.filename ?? "") &&
        record.videoUrl === `${sourceBase}/resolve/${currentRevision}/Standard_Time_Lapses/${record.filename}`, "recording source URL/path");
    }
    const access = Object.freeze({...photo, recordIds: Object.freeze([...photo.recordIds]), previewDimensions: Object.freeze([...photo.previewDimensions])});
    byWork[photo.workId] = access;
    for (const id of photo.recordIds) byRecord[id] = access;
  }
  requireValue(Object.keys(byRecord).length === Object.keys(RECORDING_INTEGRITY).length, "historical recording coverage mismatch");
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
