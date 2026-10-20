import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRecordsPayload } from "../assets/data-loader.js";
import { getDisplayReference } from "../assets/reference-policy.js";
import { buildClarificationPage } from "./build-photograph-clarifications.mjs";
import { createValidationServer, hasRequiredSourceLinks } from "./validation-helpers.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredFiles = [
  "index.html",
  "assets/style.css",
  "assets/app.js",
  "assets/data-loader.js",
  "assets/reference-policy.js",
  "assets/record-sequences.js",
  "data/records.json",
  "tools/sync-records.mjs",
  "tools/generate-previews.mjs",
  "tests/data-loader.test.mjs",
  "tests/record-sequences.test.mjs",
  "tests/reference-policy.test.mjs",
  "REFERENCE_POLICY.md",
  ".github/workflows/generate-previews.yml",
  ".github/workflows/validate-site.yml",
  ".nojekyll",
];

for (const path of requiredFiles) readFileSync(join(root, path));

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "assets/style.css"), "utf8");
const app = readFileSync(join(root, "assets/app.js"), "utf8");
const dataLoader = readFileSync(join(root, "assets/data-loader.js"), "utf8");
const recordSequences = readFileSync(join(root, "assets/record-sequences.js"), "utf8");
const payload = JSON.parse(readFileSync(join(root, "data/records.json"), "utf8"));
validateRecordsPayload(payload);

// Display JPEGs are bound to the selected photograph bytes, never to video frames
// or a substitute photo of the same work. Validation is offline and dependency-free.
const references = JSON.parse(readFileSync(join(root, "data/physical-references.json"), "utf8"));
const linkEvidence = JSON.parse(readFileSync(join(root, "data/reference-link-evidence.json"), "utf8"));
if (!html.includes('href="photograph-clarifications.html"') ||
    readFileSync(join(root, "photograph-clarifications.html"), "utf8") !== buildClarificationPage(payload, references, linkEvidence)) {
  throw new Error("Photograph clarification list is missing, unreachable or stale");
}
if (linkEvidence.schemaVersion !== 1 || linkEvidence.sourceRevision !== references.sourceRevision ||
    linkEvidence.lookupSha256 !== createHash("sha256").update(readFileSync(join(root, "data/physical-references.json"))).digest("hex")) {
  throw new Error("Qualified-link evidence snapshot mismatch");
}
for (const path of ["Work_Identity/works.csv", "Work_Identity/work_record_links.csv"]) {
  if (linkEvidence.sourceInputs?.[path]?.sha256 !== references.sourceInputs[path].sha256) {
    throw new Error("Qualified-link work-registry binding mismatch");
  }
}
const sourcePhotos = new Map(Object.values(references.records)
  .flatMap((entry) => [entry.mainImage, ...entry.additionalReferences]).filter(Boolean)
  .map((photo) => [photo.sha256, photo]));
for (const [hash, proof] of Object.entries(linkEvidence.images)) {
  const photo = sourcePhotos.get(hash);
  if (!photo || photo.relationship_status !== "proposed" || photo.work_id !== proof.workId ||
      !photo.evidence_reference_id || photo.evidence_reference_id !== proof.referenceId ||
      !/^tla-[a-f0-9]{16}$/.test(proof.bridgeRecordId) || !/^[a-f0-9]{64}$/.test(proof.sourcePhotographSha256)) {
    throw new Error("Qualified-link support is not bound to the published photograph");
  }
}
const displayedReferences = Object.values(references.records).map(getDisplayReference).filter(Boolean);
if (!app.includes('getDisplayReference(photoLookup.records[record.recordId])') ||
    !app.includes('const image = getDisplayReference(entry)')) {
  throw new Error("Drawing-reference filters and dialogs must share the owner-confirmed selection policy");
}
const photoPreviews = JSON.parse(readFileSync(join(root, "reference-previews/manifest.json"), "utf8"));
if (references.sourceRevision !== payload.sourceRevision || photoPreviews.sourceRevision !== payload.sourceRevision ||
    photoPreviews.schemaVersion !== 1 || photoPreviews.processing.longEdgePixels !== 1024) {
  throw new Error("Photograph preview snapshot mismatch");
}
const selectedPhotos = new Map(Object.values(references.records)
  .map((entry) => entry.mainImage).filter((image) => image &&
    !(Math.max(Number(image.width_px), Number(image.height_px)) <= 1024 && Number(image.size_bytes) <= 512 * 1024))
  .map((image) => [image.sha256, image]));
if (Object.keys(photoPreviews.images).length !== selectedPhotos.size) throw new Error("Photograph preview coverage mismatch");
const expectedPhotoFiles = new Set([...selectedPhotos.keys()].map((hash) => `${hash}.jpg`));
const obsoletePhotoFiles = readdirSync(join(root, "reference-previews"))
  .filter((name) => /\.jpe?g$/i.test(name) && !expectedPhotoFiles.has(name));
if (obsoletePhotoFiles.length) throw new Error(`Unexpected photograph previews: ${obsoletePhotoFiles.join(", ")}`);
for (const [sourceHash, image] of selectedPhotos) {
  const preview = photoPreviews.images[sourceHash];
  const expectedUrl = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${payload.sourceRevision}/${image.image_path}`;
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !preview || preview.sourceUrl !== expectedUrl ||
      image.fullResolutionUrl !== expectedUrl || !Number.isInteger(preview.width) || !Number.isInteger(preview.height) ||
      preview.width < 1 || preview.height < 1 || Math.max(preview.width, preview.height) > 1024 ||
      preview.width > Number(image.width_px) || preview.height > Number(image.height_px)) {
    throw new Error(`Invalid photograph preview binding: ${sourceHash}`);
  }
  const bytes = readFileSync(join(root, "reference-previews", `${sourceHash}.jpg`));
  if (bytes.length !== preview.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== preview.sha256) {
    throw new Error(`Photograph preview fixity mismatch: ${sourceHash}`);
  }
}
if (!app.includes('photograph.src = useSource ? image.fullResolutionUrl : `reference-previews/${image.sha256}.jpg`') ||
    !app.includes("elements.referenceFull.href = image.fullResolutionUrl") ||
    app.includes("photograph.src = image.fullResolutionUrl")) {
  throw new Error("Bounded photograph display or full-resolution access is missing");
}
const expectedPreviewManifest = {
  schemaVersion: 1,
  generationVersion: 2,
  sourceRevision: payload.sourceRevision,
  records: payload.records.length,
  container: "mp4",
  videoCodec: "h264",
  sampleFractions: [0.82, 0.68, 0.52],
  maxDurationSeconds: 4,
  framesPerSecond: 12,
  longEdgePixels: 480,
  audio: false,
  preset: "veryfast",
  crf: 30,
  pixelFormat: "yuv420p",
  recordIdentities: Object.fromEntries(
    payload.records.map((record) => [record.recordId, record.integrityReference]),
  ),
};

if (!payload.records.length) throw new Error("Recording index must not be empty");
if (new Set(payload.records.map((record) => record.recordId)).size !== payload.records.length) {
  throw new Error("Record IDs must be unique");
}
if (!html.includes('id="record-grid"') || !html.includes('id="record-dialog"')) {
  throw new Error("Primary browse or detail interface is missing");
}
if (
  !html.includes('<option value="desc">Newest first (REC forward)</option>') ||
  !html.includes('<option value="asc">Oldest first (REC forward)</option>') ||
  app.includes('elements.filters.querySelectorAll("select")')
) {
  throw new Error("Newest-first and oldest-first ordering must remain available");
}
if (
  !html.includes("CC BY-NC 4.0") ||
  !hasRequiredSourceLinks(html)
) {
  throw new Error("Dataset license notice or required link is missing");
}
if (/CC BY 4\.0/i.test(html)) {
  throw new Error("Dataset license notice is missing the NonCommercial restriction");
}
if (
  !app.includes('from "./data-loader.js"') ||
  !app.includes('from "./record-sequences.js"') ||
  !app.includes("loadRecords(DATA_URL)") ||
  !html.includes('id="retry-data"') ||
  !dataLoader.includes("AbortController") ||
  !dataLoader.includes('cache: attempt === 0 ? "default" : "reload"') ||
  !dataLoader.includes("validateRecordsPayload")
) {
  throw new Error("Resilient recording-index loading is missing");
}
if (
  !html.includes('class="record-part"') ||
  !recordSequences.includes("deriveRecordingSequences") ||
  !recordSequences.includes("sortRecordsForDisplay") ||
  !recordSequences.includes("extendVisibleCount")
) {
  throw new Error("Recording-sequence presentation behavior is missing");
}
if (
  !app.includes("IntersectionObserver") ||
  !app.includes('const PREVIEW_DIRECTORY = "previews"') ||
  !app.includes("video.loop = true") ||
  !app.includes('addEventListener("canplay"') ||
  !app.includes("prefers-reduced-motion: reduce") ||
  !app.includes("video.play()") ||
  /thumbnails?\//i.test(app)
) {
  throw new Error("Dynamic motion previews are missing or static recording thumbnails remain active");
}

// Decorative hero anchors and source-less card/detail anchors are allowed.
// Recording cards and the featured recording retain dynamic motion previews.
const anchorBlocks = [...html.matchAll(/<div\b(?=[^>]*\bclass="visual-anchors")(?=[^>]*\baria-hidden="true")[^>]*>([\s\S]*?)<\/div>/g)];
const anchorBlock = anchorBlocks[0];
const anchorTags = [...(anchorBlock?.[1] ?? "").matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
const cardTemplates = [...html.matchAll(/<template\b(?=[^>]*\bid="record-card-template")[^>]*>([\s\S]*?)<\/template>/g)];
const cardTemplate = cardTemplates[0];
const cardAnchorTags = [...(cardTemplate?.[1] ?? "").matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
const cardAnchorTag = cardAnchorTags[0];
const dialogAnchorTags = [...html.matchAll(/<img\b(?=[^>]*\bid="dialog-record-anchor")[^>]*>/g)].map(([tag]) => tag);
const dialogAnchorTag = dialogAnchorTags[0];
const heroCopyStart = html.indexOf('<div class="hero-copy">');
const featuredStart = html.indexOf('<figure class="hero-recording"');
if (anchorBlocks.length !== 1 || anchorTags.length !== 3 ||
    cardTemplates.length !== 1 || cardAnchorTags.length !== 1 || dialogAnchorTags.length !== 1 ||
    heroCopyStart < 0 || anchorBlock.index < heroCopyStart || anchorBlock.index > featuredStart ||
    anchorBlock[1].replace(/<\/?span\b[^>]*>/g, "").replace(/<img\b[^>]*>/g, "").trim() ||
    /<img\b/i.test(html.replace(anchorBlock[0], "").replace(cardAnchorTag, "").replace(dialogAnchorTag, ""))) {
  throw new Error("Static images must be limited to three hero anchors and one card/detail anchor each");
}
const cardAnchorAttributes = Object.fromEntries([...cardAnchorTag.matchAll(/([\w-]+)="([^"]*)"/g)]
  .map(([, name, value]) => [name, value]));
const recordSummaryIndex = cardTemplate[1].indexOf('class="record-summary"');
if (recordSummaryIndex < 0 || cardTemplate[1].indexOf(cardAnchorTag) < recordSummaryIndex ||
    cardAnchorAttributes.class !== "record-anchor-image" || cardAnchorAttributes.alt !== "" ||
    cardAnchorAttributes["aria-hidden"] !== "true" || cardAnchorAttributes.loading !== "lazy" ||
    cardAnchorAttributes.decoding !== "async" || cardAnchorAttributes.width !== "48" ||
    cardAnchorAttributes.height !== "48" || "src" in cardAnchorAttributes ||
    "srcset" in cardAnchorAttributes || "sizes" in cardAnchorAttributes ||
    !app.includes('card.querySelector(".record-anchor-image").src = `assets/record-anchors/${record.recordId}.webp`;')) {
  throw new Error("Recording anchors must be decorative lazy-loaded images from the local derived record path");
}
const dialogAnchorAttributes = Object.fromEntries([...dialogAnchorTag.matchAll(/([\w-]+)="([^"]*)"/g)]
  .map(([, name, value]) => [name, value]));
const dialogHeaderStart = html.indexOf('<header class="dialog-header">');
const dialogHeaderEnd = html.indexOf("</header>", dialogHeaderStart);
const dialogAnchorIndex = html.indexOf(dialogAnchorTag);
if (dialogHeaderStart < 0 || dialogAnchorIndex < dialogHeaderStart || dialogAnchorIndex > dialogHeaderEnd ||
    dialogAnchorAttributes.class !== "dialog-record-anchor" || dialogAnchorAttributes.alt !== "" ||
    dialogAnchorAttributes["aria-hidden"] !== "true" || dialogAnchorAttributes.decoding !== "async" ||
    dialogAnchorAttributes.width !== "48" || dialogAnchorAttributes.height !== "48" ||
    "src" in dialogAnchorAttributes || "srcset" in dialogAnchorAttributes || "sizes" in dialogAnchorAttributes ||
    !app.includes('elements.dialogAnchor.src = `assets/record-anchors/${record.recordId}.webp`;')) {
  throw new Error("Detail anchors must be decorative 48-pixel images using the same local recording path");
}
const anchorManifest = JSON.parse(readFileSync(join(root, "assets/visual-anchors/manifest.json"), "utf8"));
if (anchorManifest.schemaVersion !== 1 || anchorManifest.sourceRevision !== payload.sourceRevision ||
    anchorManifest.processing?.longEdgePixels !== 48 || anchorManifest.processing?.withoutEnlargement !== true ||
    Object.keys(anchorManifest.images ?? {}).length !== 3) {
  throw new Error("Decorative hero anchor manifest has an invalid snapshot or size bound");
}
const anchorSources = new Set();
const eligibleAnchorPhotos = new Map(displayedReferences.map((photo) => [photo.sha256, photo]));
let anchorBytes = 0;
for (const tag of anchorTags) {
  const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)]
    .map(([, name, value]) => [name, value]));
  if (!/^assets\/visual-anchors\/[a-f0-9]{64}\.webp$/.test(attributes.src) ||
      attributes.alt !== "" || attributes.decoding !== "async" ||
      !/^\d+$/.test(attributes.width) || !/^\d+$/.test(attributes.height) ||
      Number(attributes.width) < 1 || Number(attributes.height) < 1 ||
      Math.max(Number(attributes.width), Number(attributes.height)) > 48 ||
      "srcset" in attributes || "sizes" in attributes) {
    throw new Error("Decorative hero anchors must have bounded local sources and explicit dimensions");
  }
  const sourceHash = attributes.src.match(/([a-f0-9]{64})\.webp$/)[1];
  const anchor = anchorManifest.images[sourceHash];
  const preview = photoPreviews.images[sourceHash];
  const photo = eligibleAnchorPhotos.get(sourceHash);
  const usesPreview = anchor && preview && anchor.sourcePath === `reference-previews/${sourceHash}.jpg` &&
    anchor.sourceSha256 === preview.sha256 && anchor.sourceUrl === preview.sourceUrl;
  const usesSmallPublicSource = anchor && photo && anchor.sourcePath === photo.fullResolutionUrl &&
    anchor.sourceSha256 === sourceHash && Math.max(Number(photo.width_px), Number(photo.height_px)) <= 1024 &&
    Number(photo.size_bytes) <= 512 * 1024;
  if (anchorSources.has(sourceHash) || !anchor || !photo || (!usesPreview && !usesSmallPublicSource) ||
      anchor.sourceUrl !== photo.fullResolutionUrl || anchor.workId !== photo.work_id ||
      !Number.isInteger(anchor.width) || !Number.isInteger(anchor.height) ||
      anchor.width !== Number(attributes.width) || anchor.height !== Number(attributes.height) ||
      !/^[a-f0-9]{64}$/.test(anchor.sha256)) {
    throw new Error(`Invalid decorative hero anchor binding: ${sourceHash}`);
  }
  const bytes = readFileSync(join(root, attributes.src));
  if (bytes.length > 4096 || bytes.length !== anchor.sizeBytes ||
      bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" ||
      createHash("sha256").update(bytes).digest("hex") !== anchor.sha256) {
    throw new Error(`Decorative hero anchor fixity or byte limit failed: ${sourceHash}`);
  }
  anchorSources.add(sourceHash);
  anchorBytes += bytes.length;
}
if (anchorBytes > 12 * 1024) throw new Error("Decorative hero anchors exceed the 12 KiB transfer limit");

const recordAnchorDirectory = join(root, "assets/record-anchors");
const recordAnchorManifest = JSON.parse(readFileSync(join(recordAnchorDirectory, "manifest.json"), "utf8"));
const recordAnchorProcessing = recordAnchorManifest.processing;
if (recordAnchorManifest.schemaVersion !== 1 || recordAnchorManifest.sourceRevision !== payload.sourceRevision ||
    Object.keys(recordAnchorManifest.records ?? {}).length !== payload.records.length ||
    recordAnchorProcessing?.frameIndex !== 0 || recordAnchorProcessing?.width !== 48 ||
    recordAnchorProcessing?.height !== 48 || recordAnchorProcessing?.fit !== "contain" ||
    recordAnchorProcessing?.quality !== 45 || recordAnchorProcessing?.audio !== false ||
    typeof recordAnchorProcessing?.ffmpegVersion !== "string" || !recordAnchorProcessing.ffmpegVersion.trim()) {
  throw new Error("Recording anchor manifest has an invalid snapshot, coverage or processing contract");
}
const expectedRecordAnchorFiles = new Set(payload.records.map(({ recordId }) => `${recordId}.webp`));
const unexpectedRecordAnchors = readdirSync(recordAnchorDirectory)
  .filter((name) => /\.webp$/i.test(name) && !expectedRecordAnchorFiles.has(name));
if (unexpectedRecordAnchors.length) throw new Error(`Unexpected recording anchors: ${unexpectedRecordAnchors.join(", ")}`);
let recordAnchorBytes = 0;
for (const record of payload.records) {
  const anchor = recordAnchorManifest.records[record.recordId];
  if (!anchor || anchor.sourcePath !== `previews/${record.recordId}.mp4` ||
      anchor.sourceIntegrityReference !== record.integrityReference ||
      (Object.hasOwn(anchor, "ffmpegVersion") &&
        (typeof anchor.ffmpegVersion !== "string" || !anchor.ffmpegVersion.trim())) ||
      !/^[a-f0-9]{64}$/.test(anchor.sourceSha256) || !/^[a-f0-9]{64}$/.test(anchor.sha256) ||
      anchor.width !== 48 || anchor.height !== 48) {
    throw new Error(`Invalid recording anchor binding: ${record.recordId}`);
  }
  const source = readFileSync(join(root, anchor.sourcePath));
  const bytes = readFileSync(join(recordAnchorDirectory, `${record.recordId}.webp`));
  if (createHash("sha256").update(source).digest("hex") !== anchor.sourceSha256 ||
      bytes.length > 2048 || bytes.length !== anchor.sizeBytes ||
      bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" ||
      createHash("sha256").update(bytes).digest("hex") !== anchor.sha256) {
    throw new Error(`Recording anchor fixity or byte limit failed: ${record.recordId}`);
  }
  recordAnchorBytes += bytes.length;
}
if (recordAnchorBytes > 2 * 1024 * 1024) throw new Error("Recording anchors exceed the 2 MiB total transfer limit");
if (/bd5a3c|a54831|brown|rust/i.test(css)) {
  throw new Error("Warm brown accent remains in the stylesheet");
}

const invalid = payload.records.filter(
  (record) =>
    !record.recordId ||
    !record.filename ||
    !record.date ||
    !record.videoUrl.startsWith(
      `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${payload.sourceRevision}/`,
    ),
);
if (invalid.length) throw new Error(`${invalid.length} records failed source validation`);

const previewDirectory = join(root, "previews");
let previewFilenames = [];
let previewManifest = null;
try {
  previewFilenames = readdirSync(previewDirectory).filter(
    (name) =>
      /^tla-[a-f0-9]+\.mp4$/.test(name) &&
      statSync(join(previewDirectory, name)).size >= 8_000,
  );
  previewManifest = JSON.parse(readFileSync(join(previewDirectory, "manifest.json"), "utf8"));
} catch {
  previewFilenames = [];
  previewManifest = null;
}

if (process.env.REQUIRE_PREVIEWS === "1") {
  const expected = new Set(payload.records.map((record) => `${record.recordId}.mp4`));
  const missing = [...expected].filter((name) => !previewFilenames.includes(name));
  const unexpected = previewFilenames.filter((name) => !expected.has(name));
  const manifestMatches =
    JSON.stringify(previewManifest) === JSON.stringify(expectedPreviewManifest);
  if (missing.length || unexpected.length || !manifestMatches) {
    throw new Error(
      `Preview pack mismatch: ${missing.length} missing, ${unexpected.length} unexpected, manifest ${manifestMatches ? "valid" : "invalid"}`,
    );
  }
}

const server = createValidationServer(root);

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

for (const path of [
  "/",
  "/assets/style.css",
  "/assets/app.js",
  "/assets/data-loader.js",
  "/assets/reference-policy.js",
  "/assets/record-sequences.js",
  "/data/records.json",
]) {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
}

await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);

console.log(
  JSON.stringify(
    {
      status: "valid",
      records: payload.records.length,
      unknownFinishTimes: payload.records.filter((record) => !record.time).length,
      previews: previewFilenames.length,
      recordAnchors: Object.keys(recordAnchorManifest.records).length,
      recordAnchorBytes,
      heroAnchorBytes: anchorBytes,
      photographPreviews: selectedPhotos.size,
      displayedDrawingReferences: displayedReferences.length,
      displayedDrawingPhotographs: new Set(displayedReferences.map((image) => image.sha256)).size,
      previewMode: "deterministic-motion-clips",
      sourceRevision: payload.sourceRevision,
    },
    null,
    2,
  ),
);
