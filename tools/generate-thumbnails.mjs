import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const payload = JSON.parse(readFileSync(join(root, "data/records.json"), "utf8"));
const outputDirectory = join(root, "thumbnails");
const concurrencyFlag = process.argv.indexOf("--concurrency");
const concurrency = Math.max(
  1,
  Number(concurrencyFlag >= 0 ? process.argv[concurrencyFlag + 1] : 8) || 8,
);

mkdirSync(outputDirectory, { recursive: true });

const queue = payload.records.map((record) => ({ record, attempt: 0 }));
const failures = [];
let completed = 0;
let skipped = 0;
let generatedBytes = 0;

function outputPath(recordId) {
  return join(outputDirectory, `${recordId}.jpg`);
}

function isComplete(path) {
  try {
    return statSync(path).size >= 4_000;
  } catch {
    return false;
  }
}

function generate({ record, attempt }) {
  return new Promise((resolve) => {
    const finalPath = outputPath(record.recordId);
    const temporaryPath = `${finalPath}.part.jpg`;

    if (isComplete(finalPath)) {
      skipped += 1;
      completed += 1;
      process.stdout.write(
        `[${completed}/${payload.records.length}] ${record.recordId} cached\n`,
      );
      resolve();
      return;
    }

    rmSync(temporaryPath, { force: true });
    const seekFractions = [0.88, 0.74, 0.56];
    const fraction = seekFractions[Math.min(attempt, seekFractions.length - 1)];
    const seekSeconds = Math.max(
      0.1,
      Math.min(record.durationSeconds - 0.15, record.durationSeconds * fraction),
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
      "-ss",
      seekSeconds,
      "-i",
      record.videoUrl,
      "-an",
      "-frames:v",
      "1",
      "-vf",
      "scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)'",
      "-q:v",
      "4",
      temporaryPath,
    ];

    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => {
      if (errorText.length < 4_000) errorText += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0 && isComplete(temporaryPath)) {
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
