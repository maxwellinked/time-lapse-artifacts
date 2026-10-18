import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDisplayReference } from "../assets/reference-policy.js";

// Build-time only. Inputs are existing public display JPEGs or small published JPEGs.
// No network requests or private source files are used.
const sharp = createRequire(import.meta.url)("sharp");
if (sharp.versions.sharp !== "0.35.5" || sharp.versions.vips !== "8.18.7") {
  throw new Error("Use sharp 0.35.5 with its bundled libvips 8.18.7");
}
sharp.concurrency(1);
const started = performance.now();
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "assets/visual-anchors");
const manifestPath = join(directory, "manifest.json");
const references = JSON.parse(await readFile(join(root, "data/physical-references.json"), "utf8"));
const previews = JSON.parse(await readFile(join(root, "reference-previews/manifest.json"), "utf8"));
if (references.sourceRevision !== previews.sourceRevision) throw new Error("Photograph snapshot mismatch");
const selected = new Map(Object.values(references.records)
  .map(getDisplayReference).filter(Boolean).map((image) => [image.sha256, image]));
const sources = [
  "383812a0374f75bfb4c8285b90c64e3cc836a3dbbf47003b14903fa9b34c92be",
  "fe572fc188835c4fb57c1a182cba0e5f75c52d828056a0f21f20ff5dad74246b",
  "a804b44c29b7b972eae46a5af40a66fea82ad0a61226c0de8acddc1a9089f853",
];
const processing = {
  sharp: sharp.versions.sharp,
  libvips: sharp.versions.vips,
  longEdgePixels: 48,
  fit: "inside",
  withoutEnlargement: true,
  orientation: "EXIF auto-orient once; existing display previews have no orientation tag",
  colour: "sRGB with embedded ICC; no EXIF or private metadata",
  kernel: "lanczos3",
  webpQuality: 45,
  effort: 6,
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
let previous;
try { previous = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* First build. */ }
const reusable = JSON.stringify(previous?.processing) === JSON.stringify(processing);
await mkdir(directory, { recursive: true });
const images = {};
let generated = 0;
for (const sourceSha of sources) {
  const image = selected.get(sourceSha);
  const preview = previews.images?.[sourceSha];
  if (!image || (preview && preview.sourceUrl !== image.fullResolutionUrl)) {
    throw new Error("Decorative source is not an eligible published photograph");
  }
  const sourcePath = preview ? `reference-previews/${sourceSha}.jpg` : image.fullResolutionUrl;
  const sourceSha256 = preview ? preview.sha256 : sourceSha;
  const sourceSize = preview ? preview.sizeBytes : Number(image.size_bytes);
  const output = join(directory, `${sourceSha}.webp`);
  const cached = reusable && previous.images?.[sourceSha];
  if (cached && cached.sourceSha256 === sourceSha256 && cached.sourcePath === sourcePath &&
      cached.sourceUrl === image.fullResolutionUrl && cached.workId === image.work_id) {
    try {
      const bytes = await readFile(output);
      if (sha256(bytes) === cached.sha256 && bytes.length === cached.sizeBytes) {
        images[sourceSha] = cached;
        continue;
      }
    } catch { /* Regenerate a missing or damaged small derivative. */ }
  }
  if (!preview && (!process.env.VISUAL_ANCHOR_SOURCE_DIRECTORY ||
      Math.max(Number(image.width_px), Number(image.height_px)) > 1024 || sourceSize > 512 * 1024)) {
    throw new Error("Provide the small published JPEG in VISUAL_ANCHOR_SOURCE_DIRECTORY, named <source SHA>.jpg");
  }
  const inputPath = preview ? join(root, sourcePath)
    : join(process.env.VISUAL_ANCHOR_SOURCE_DIRECTORY, `${sourceSha}.jpg`);
  const source = await readFile(inputPath);
  if (sha256(source) !== sourceSha256 || source.length !== sourceSize) {
    throw new Error("Published input identity mismatch");
  }
  const { data, info } = await sharp(source)
    .autoOrient()
    .resize({ width: 48, height: 48, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .withIccProfile("srgb")
    .webp({ quality: 45, effort: 6 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > 4096) throw new Error("Decorative image exceeds 4 KiB budget");
  await writeFile(output, data);
  images[sourceSha] = {
    sourcePath,
    sourceSha256,
    sourceUrl: image.fullResolutionUrl,
    workId: image.work_id,
    sha256: sha256(data),
    width: info.width,
    height: info.height,
    sizeBytes: data.length,
  };
  generated += 1;
}
await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  sourceRevision: references.sourceRevision,
  processing,
  images,
}, null, 2)}\n`);
console.log(JSON.stringify({
  images: sources.length,
  generated,
  reused: sources.length - generated,
  imageBytes: Object.values(images).reduce((sum, image) => sum + image.sizeBytes, 0),
  elapsedMilliseconds: Math.round(performance.now() - started),
}));
