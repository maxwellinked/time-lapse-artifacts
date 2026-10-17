import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Build-time only: npm install --no-save --package-lock=false sharp@0.34.5
const sharp = createRequire(import.meta.url)("sharp");
if (sharp.versions.sharp !== "0.34.5" || sharp.versions.vips !== "8.17.3") {
  throw new Error("Use sharp 0.34.5 with its bundled libvips 8.17.3");
}
sharp.concurrency(1);
const root = fileURLToPath(new URL("../", import.meta.url));
const lookup = JSON.parse(await readFile(join(root, "data/physical-references.json"), "utf8"));
const records = JSON.parse(await readFile(join(root, "data/records.json"), "utf8"));
if (lookup.sourceRevision !== records.sourceRevision) throw new Error("Reference snapshot mismatch");
const directory = join(root, "reference-previews");
const manifestPath = join(directory, "manifest.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const processing = {
  sharp: sharp.versions.sharp,
  libvips: sharp.versions.vips,
  longEdgePixels: 1024,
  fit: "inside",
  withoutEnlargement: true,
  orientation: "EXIF auto-orient once; remove orientation tag",
  colour: "convert to sRGB; embed sRGB ICC",
  jpegQuality: 82,
  chromaSubsampling: "4:4:4",
};
const images = new Map();
for (const { mainImage: image } of Object.values(lookup.records)) {
  if (!image) continue; // Preserve unresolved selection; no substitute candidates.
  const expected = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${lookup.sourceRevision}/${image.image_path}`;
  if (!/^[a-f0-9]{64}$/.test(image.sha256) || image.fullResolutionUrl !== expected) {
    throw new Error("Invalid selected source binding");
  }
  const previous = images.get(image.sha256);
  if (previous && previous.fullResolutionUrl !== image.fullResolutionUrl) throw new Error("Conflicting source identity");
  // Existing small selected photographs need no extra representation.
  if (Math.max(Number(image.width_px), Number(image.height_px)) <= 1024 && Number(image.size_bytes) <= 512 * 1024) continue;
  images.set(image.sha256, image);
}
await mkdir(directory, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* First build. */ }
const reusable = JSON.stringify(previous?.processing) === JSON.stringify(processing);
const previews = {};
let generated = 0;
const queue = [...images.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
async function worker() {
  while (queue.length) {
    const image = queue.shift();
    const output = join(directory, `${image.sha256}.jpg`);
    const cached = reusable && previous.images?.[image.sha256];
    if (cached) {
      try {
        const bytes = await readFile(output);
        if (sha256(bytes) === cached.sha256 && bytes.length === cached.sizeBytes) {
          previews[image.sha256] = { ...cached, sourceUrl: image.fullResolutionUrl };
          continue;
        }
      } catch { /* Regenerate a missing or damaged display preview. */ }
    }
    let source;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(image.fullResolutionUrl, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`Source returned ${response.status}`);
        source = Buffer.from(await response.arrayBuffer());
        if (sha256(source) !== image.sha256) throw new Error("Source SHA-256 mismatch");
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    const { data, info } = await sharp(source)
      .autoOrient()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .withIccProfile("srgb")
      .jpeg({ quality: 82, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    await writeFile(output, data);
    previews[image.sha256] = {
      sourceUrl: image.fullResolutionUrl,
      sha256: sha256(data),
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
    };
    generated += 1;
    if (generated % 25 === 0) console.log(`Generated ${generated} reference previews`);
  }
}
await Promise.all([worker(), worker()]);
await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  sourceRevision: lookup.sourceRevision,
  processing,
  images: Object.fromEntries(Object.entries(previews).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2)}\n`);
console.log(JSON.stringify({ previews: images.size, generated }));
