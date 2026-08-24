import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const payload = JSON.parse(readFileSync(join(root, "data/records.json"), "utf8"));
const outputDirectory = join(root, "previews");
const manifestPath = join(outputDirectory, "manifest.json");
const concurrencyFlag = process.argv.indexOf("--concurrency");
const previousRecordsFlag = process.argv.indexOf("--previous-records");
const concurrency = Math.max(
  1,
  Number(concurrencyFlag >= 0 ? process.argv[concurrencyFlag + 1] : 2) || 2,
);
const previousRecordsPath =
  previousRecordsFlag >= 0 ? process.argv[previousRecordsFlag + 1] : null;

mkdirSync(outputDirectory, { recursive: true });

const previewSpec = {
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
let cachedManifest = null;
try {
  cachedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  cachedManifest = null;
}
const encodingFields = [
  "schemaVersion",
  "container",
  "videoCodec",
  "sampleFractions",
  "maxDurationSeconds",
  "framesPerSecond",
  "longEdgePixels",
  "audio",
  "preset",
  "crf",
  "pixelFormat",
];
const cacheVersionCompatible =
  cachedManifest?.generationVersion === previewSpec.generationVersion ||
  (cachedManifest?.generationVersion === 1 && Boolean(previousRecordsPath));
const cacheMatchesEncoding =
  cacheVersionCompatible &&
  encodingFields.every(
    (field) => JSON.stringify(cachedManifest[field]) === JSON.stringify(previewSpec[field]),
  );
let cachedRecordIdentities = cachedManifest?.recordIdentities ?? null;

if (!cachedRecordIdentities && previousRecordsPath && cachedManifest) {
  const previousPayload = JSON.parse(readFileSync(previousRecordsPath, "utf8"));
  if (
    previousPayload.sourceRevision !== cachedManifest.sourceRevision ||
    previousPayload.records.length !== cachedManifest.records
  ) {
    throw new Error("Previous records do not match the cached preview manifest");
  }
  cachedRecordIdentities = Object.fromEntries(
    previousPayload.records.map((record) => [record.recordId, record.integrityReference]),
  );
}

const queue = payload.records.map((record) => ({ record, attempt: 0 }));
const validFilenames = new Set(payload.records.map((record) => `${record.recordId}.mp4`));
const failures = [];
let completed = 0;
let skipped = 0;
let generatedBytes = 0;

for (const filename of readdirSync(outputDirectory)) {
  if (filename.endsWith(".mp4") && !validFilenames.has(filename)) {
    rmSync(join(outputDirectory, filename), { force: true });
  }
}

function outputPath(recordId) {
  return join(outputDirectory, `${recordId}.mp4`);
}

function isComplete(record, path, requireCurrentIdentity = true) {
  try {
    if (
      requireCurrentIdentity &&
      (!cacheMatchesEncoding ||
        cachedRecordIdentities?.[record.recordId] !== record.integrityReference)
    ) {
      return false;
    }
    return statSync(path).size >= 8_000;
  } catch {
    return false;
  }
}

function generate({ record, attempt }) {
  return new Promise((resolve) => {
    const finalPath = outputPath(record.recordId);
    const temporaryPath = `${finalPath}.part.mp4`;

    if (isComplete(record, finalPath)) {
      skipped += 1;
      completed += 1;
      process.stdout.write(
        `[${completed}/${payload.records.length}] ${record.recordId} cached\n`,
      );
      resolve();
      return;
    }

    rmSync(temporaryPath, { force: true });
    const fraction =
      previewSpec.sampleFractions[
        Math.min(attempt, previewSpec.sampleFractions.length - 1)
      ];
    const clipSeconds = Math.min(
      previewSpec.maxDurationSeconds,
      Math.max(0.5, record.durationSeconds - 0.1),
    );
    const latestStart = Math.max(0, record.durationSeconds - clipSeconds - 0.15);
    const seekSeconds = Math.max(
      0,
      Math.min(latestStart, record.durationSeconds * fraction),
    ).toFixed(3);

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-rw_timeout",
      "60000000",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-seekable",
      "1",
      "-multiple_requests",
      "1",
      "-ss",
      seekSeconds,
      "-i",
      record.videoUrl,
      "-t",
      clipSeconds.toFixed(3),
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      `fps=${previewSpec.framesPerSecond},scale='if(gt(iw,ih),${previewSpec.longEdgePixels},-2)':'if(gt(iw,ih),-2,${previewSpec.longEdgePixels})':flags=lanczos`,
      "-c:v",
      "libx264",
      "-preset",
      previewSpec.preset,
      "-crf",
      String(previewSpec.crf),
      "-pix_fmt",
      previewSpec.pixelFormat,
      "-g",
      String(previewSpec.framesPerSecond * previewSpec.maxDurationSeconds),
      "-keyint_min",
      String(previewSpec.framesPerSecond * previewSpec.maxDurationSeconds),
      "-sc_threshold",
      "0",
      "-movflags",
      "+faststart",
      temporaryPath,
    ];

    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => {
      if (errorText.length < 4_000) errorText += chunk.toString();
    });
    child.on("error", (error) => {
      errorText += `\n${error.message}`;
    });

    child.on("close", (code) => {
      if (code === 0 && isComplete(record, temporaryPath, false)) {
        renameSync(temporaryPath, finalPath);
        const size = statSync(finalPath).size;
        generatedBytes += size;
        completed += 1;
        process.stdout.write(
          `[${completed}/${payload.records.length}] ${record.recordId} ${(size / 1024).toFixed(0)} KB\n`,
        );
      } else if (attempt < 2) {
        rmSync(temporaryPath, { force: true });
        queue.push({ record, attempt: attempt + 1 });
        process.stdout.write(`${record.recordId} retry ${attempt + 2}/3\n`);
      } else {
        rmSync(temporaryPath, { force: true });
        completed += 1;
        failures.push({
          recordId: record.recordId,
          filename: record.filename,
          error: errorText.trim().slice(-800),
        });
        process.stdout.write(
          `[${completed}/${payload.records.length}] ${record.recordId} FAILED\n`,
        );
      }
      resolve();
    });
  });
}

async function worker() {
  while (queue.length) {
    const item = queue.shift();
    if (item) await generate(item);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

if (!failures.length) {
  writeFileSync(manifestPath, `${JSON.stringify(previewSpec, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      records: payload.records.length,
      completed,
      skipped,
      generatedMegabytes: Number((generatedBytes / 1024 / 1024).toFixed(2)),
      failures,
    },
    null,
    2,
  ),
);

if (failures.length) process.exitCode = 1;
