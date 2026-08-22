import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRecordsPayload } from "../assets/data-loader.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredFiles = [
  "index.html",
  "assets/style.css",
  "assets/app.js",
  "assets/data-loader.js",
  "data/records.json",
  "tools/generate-previews.mjs",
  "tests/data-loader.test.mjs",
  ".github/workflows/generate-previews.yml",
  ".github/workflows/validate-site.yml",
  ".nojekyll",
];

for (const path of requiredFiles) readFileSync(join(root, path));

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "assets/style.css"), "utf8");
const app = readFileSync(join(root, "assets/app.js"), "utf8");
const dataLoader = readFileSync(join(root, "assets/data-loader.js"), "utf8");
const payload = JSON.parse(readFileSync(join(root, "data/records.json"), "utf8"));
validateRecordsPayload(payload);
const expectedPreviewManifest = {
  schemaVersion: 1,
  generationVersion: 1,
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
};

if (payload.records.length !== 357) throw new Error("Record count must be 357");
if (new Set(payload.records.map((record) => record.recordId)).size !== 357) {
  throw new Error("Record IDs must be unique");
}
if (!html.includes('id="record-grid"') || !html.includes('id="record-dialog"')) {
  throw new Error("Primary browse or detail interface is missing");
}
if (
  !html.includes("CC BY-NC 4.0") ||
  !html.includes("https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts") ||
  !html.includes("https://creativecommons.org/licenses/by-nc/4.0/")
) {
  throw new Error("Dataset license notice or required link is missing");
}
if (/CC BY 4\.0/i.test(html)) {
  throw new Error("Dataset license notice is missing the NonCommercial restriction");
}
if (
  !app.includes('from "./data-loader.js"') ||
  !app.includes("loadRecords(DATA_URL)") ||
  !html.includes('id="retry-data"') ||
  !dataLoader.includes("AbortController") ||
  !dataLoader.includes('cache: attempt === 0 ? "default" : "reload"') ||
  !dataLoader.includes("validateRecordsPayload")
) {
  throw new Error("Resilient recording-index loading is missing");
}
if (
  !app.includes("IntersectionObserver") ||
  !app.includes('const PREVIEW_DIRECTORY = "previews"') ||
  !app.includes("video.loop = true") ||
  !app.includes('addEventListener("canplay"') ||
  !app.includes("prefers-reduced-motion: reduce") ||
  !app.includes("video.play()") ||
  /thumbnails?\//i.test(app) ||
  /<img\b/i.test(html)
) {
  throw new Error("Dynamic motion previews are missing or static images remain active");
}
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

const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mp4": "video/mp4",
};

const server = createServer((request, response) => {
  const requested = request.url === "/" ? "index.html" : request.url.slice(1);
  const safePath = normalize(requested).replace(/^\.\.(\/|\\|$)/, "");
  try {
    const body = readFileSync(join(root, safePath));
    response.writeHead(200, { "content-type": types[extname(safePath)] ?? "text/plain" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

for (const path of [
  "/",
  "/assets/style.css",
  "/assets/app.js",
  "/assets/data-loader.js",
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
      previewMode: "deterministic-motion-clips",
      sourceRevision: payload.sourceRevision,
    },
    null,
    2,
  ),
);
