import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const requiredFiles = [
  "index.html",
  "assets/style.css",
  "assets/app.js",
  "data/records.json",
  ".nojekyll",
];

for (const path of requiredFiles) readFileSync(join(root, path));

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "assets/style.css"), "utf8");
const app = readFileSync(join(root, "assets/app.js"), "utf8");
const payload = JSON.parse(readFileSync(join(root, "data/records.json"), "utf8"));

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
  !app.includes("thumbnails/${record.recordId}.jpg") ||
  !app.includes("IntersectionObserver") ||
  !app.includes("video.duration * 0.88")
) {
  throw new Error("Static thumbnails or their live-video fallback are missing");
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

const thumbnailDirectory = join(root, "thumbnails");
let thumbnailCount = 0;
try {
  thumbnailCount = readdirSync(thumbnailDirectory).filter((name) => {
    if (!/^tla-[a-f0-9]+\.jpg$/.test(name)) return false;
    return statSync(join(thumbnailDirectory, name)).size >= 4_000;
  }).length;
} catch {
  thumbnailCount = 0;
}

if (process.env.REQUIRE_THUMBNAILS === "1" && thumbnailCount !== payload.records.length) {
  throw new Error(`Expected ${payload.records.length} thumbnails, found ${thumbnailCount}`);
}

const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
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

for (const path of ["/", "/assets/style.css", "/assets/app.js", "/data/records.json"]) {
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
      thumbnails: thumbnailCount,
      sourceRevision: payload.sourceRevision,
    },
    null,
    2,
  ),
);
