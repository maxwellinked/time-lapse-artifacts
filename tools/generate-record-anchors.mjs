import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Offline derivatives of existing public preview clips only. No source downloads.
const root = fileURLToPath(new URL("../", import.meta.url));
const defaultOutput = join(root, "assets", "record-anchors");
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  if (!["--limit", "--output", "--ffmpeg"].includes(name) || !args[index + 1] || Object.hasOwn(options, name)) {
    throw new Error("Usage: node tools/generate-record-anchors.mjs [--limit 12 --output separate-directory] [--ffmpeg executable]");
  }
  options[name] = args[index + 1];
}
const output = resolve(options["--output"] ?? defaultOutput);
const outputParent = dirname(output);
if (output === outputParent) throw new Error("Output must be a dedicated anchor directory, not a filesystem root");
const limit = options["--limit"] === undefined ? null : Number(options["--limit"]);
if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error("Limit must be a positive integer");
if (limit !== null && output.toLowerCase() === resolve(defaultOutput).toLowerCase()) {
  throw new Error("Partial builds require a separate --output directory; default assets must cover every recording");
}
const ffmpeg = options["--ffmpeg"] ?? process.env.FFMPEG_PATH ?? "ffmpeg";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const started = performance.now();
const recordData = JSON.parse(await readFile(join(root, "data", "records.json"), "utf8"));
const previewManifest = JSON.parse(await readFile(join(root, "previews", "manifest.json"), "utf8"));
if (!Array.isArray(recordData.records) || !recordData.records.length || !/^[a-f0-9]{40}$/.test(recordData.sourceRevision)) {
  throw new Error("Invalid recording index");
}
const ids = recordData.records.map((record) => record.recordId);
if (new Set(ids).size !== ids.length || ids.some((id) => !/^tla-[a-f0-9]{16}$/.test(id))) throw new Error("Invalid or repeated record IDs");
if (previewManifest.sourceRevision !== recordData.sourceRevision || previewManifest.records !== ids.length ||
    !previewManifest.recordIdentities || Object.keys(previewManifest.recordIdentities).length !== ids.length ||
    Object.keys(previewManifest.recordIdentities).some((id) => !ids.includes(id))) {
  throw new Error("Preview manifest revision or exact record coverage differs from recording index");
}
for (const record of recordData.records) {
  if (!record.integrityReference || previewManifest.recordIdentities[record.recordId] !== record.integrityReference) {
    throw new Error(`Preview identity differs for ${record.recordId}`);
  }
  const source = await stat(join(root, "previews", `${record.recordId}.mp4`));
  if (!source.isFile() || !source.size) throw new Error(`Missing or empty preview for ${record.recordId}`);
}
if (limit !== null && limit > ids.length) throw new Error("Limit exceeds recording count");

function runFfmpeg(parameters, input) {
  return new Promise((accept, reject) => {
    const child = spawn(ffmpeg, parameters, { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    let outputBytes = 0;
    let failure;
    const deadline = setTimeout(() => {
      failure = new Error("FFmpeg exceeded its 60 second deadline");
      child.kill();
    }, 60_000);
    child.stdout.on("data", (bytes) => {
      outputBytes += bytes.length;
      if (outputBytes > 1024 * 1024) {
        failure = new Error("FFmpeg output exceeded the 1 MiB process limit");
        child.kill();
      } else chunks.push(bytes);
    });
    child.stderr.on("data", (bytes) => { stderr = (stderr + bytes.toString()).slice(-16_384); });
    child.on("error", (error) => { failure = error; });
    // A one-frame decoder can close stdin before the rest of a four-second clip
    // is written. Successful exit and validated image bytes still remain required.
    child.stdin.on("error", (error) => { if (!["EPIPE", "EOF"].includes(error.code)) failure = error; });
    child.on("close", (code, signal) => {
      clearTimeout(deadline);
      if (failure || code !== 0) reject(failure ?? new Error(`FFmpeg exited ${code ?? signal}: ${stderr}`));
      else accept(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}

function webpDimensions(bytes) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new Error("Invalid WebP output");
  }
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("Truncated WebP chunk");
    if (kind === "VP8 " && size >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    }
    if (kind === "VP8X" && size >= 10) return [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    if (kind === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + size + (size % 2);
  }
  throw new Error("WebP dimensions unavailable");
}

const ffmpegVersion = (await runFfmpeg(["-version"])).toString().split(/\r?\n/)[0];
const processing = {
  ffmpegVersion, frameIndex: 0, width: 48, height: 48,
  fit: "contain", quality: 45, audio: false, padding: "#1c2026",
};
let previous;
try { previous = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
let outputExists = false;
try {
  const current = await lstat(output);
  if (!current.isDirectory() || current.isSymbolicLink()) throw new Error("Output must be a regular dedicated directory");
  outputExists = true;
  const contents = await readdir(output, { withFileTypes: true });
  if ((contents.length && (previous?.schemaVersion !== 1 || !previous.records)) ||
      contents.some((entry) => !entry.isFile() || entry.isSymbolicLink() ||
        (entry.name !== "manifest.json" && !/^tla-[a-f0-9]{16}\.webp$/.test(entry.name)))) {
    throw new Error("Refusing to replace a directory containing files outside the anchor manifest/output contract");
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
// A new index revision alone does not change image bytes. Each cache entry must
// still match the exact preview bytes, recording identity and processing below.
const reusable = previous?.schemaVersion === 1 &&
  JSON.stringify(previous.processing) === JSON.stringify(processing);
const selected = limit === null ? recordData.records : recordData.records.slice(0, limit);
// Stage a complete replacement beside the output. Never modify published files
// during decoding, cache validation, or manifest preparation.
const token = randomUUID();
const staging = join(outputParent, `.record-anchors-stage-${token}`);
const backup = join(outputParent, `.record-anchors-backup-${token}`);
async function removeBuildDirectory(path) {
  if (![staging, backup].includes(path) || resolve(dirname(path)) !== resolve(outputParent) || path === output) {
    throw new Error("Refusing cleanup outside this build's exact sibling staging/backup paths");
  }
  await rm(path, { recursive: true, force: true });
}
await mkdir(outputParent, { recursive: true });
await mkdir(staging);
let stagingExists = true;
const queue = [...selected];
const entries = {};
let generated = 0;
let reused = 0;
let stopped = false;
async function worker() {
  while (!stopped && queue.length) {
    const record = queue.shift();
    try {
      const sourcePath = `previews/${record.recordId}.mp4`;
      // Feed these exact hashed bytes to FFmpeg, avoiding a second mutable source read.
      const source = await readFile(join(root, sourcePath));
      const sourceSha256 = sha256(source);
      const target = join(staging, `${record.recordId}.webp`);
      const cached = reusable && previous.records?.[record.recordId];
      if (cached && cached.sourcePath === sourcePath && cached.sourceSha256 === sourceSha256 &&
          cached.sourceIntegrityReference === record.integrityReference && cached.width === 48 && cached.height === 48) {
        let cachedBytes;
        try {
          const bytes = await readFile(join(output, `${record.recordId}.webp`));
          const dimensions = webpDimensions(bytes);
          if (bytes.length <= 2048 && bytes.length === cached.sizeBytes && sha256(bytes) === cached.sha256 &&
              dimensions[0] === 48 && dimensions[1] === 48) {
            cachedBytes = bytes;
          }
        } catch { /* Rebuild a missing or damaged derivative from the verified source. */ }
        if (cachedBytes) {
          await writeFile(target, cachedBytes);
          entries[record.recordId] = cached;
          reused += 1;
          continue;
        }
      }
      const bytes = await runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-filter_threads", "1",
        "-i", "pipe:0", "-map", "0:v:0", "-frames:v", "1", "-an",
        "-vf", "select=eq(n\\,0),scale=48:48:force_original_aspect_ratio=decrease:flags=lanczos,pad=48:48:(ow-iw)/2:(oh-ih)/2:color=0x1c2026,setsar=1,format=yuv420p",
        "-c:v", "libwebp", "-quality", "45", "-compression_level", "6", "-f", "webp", "pipe:1",
      ], source);
      const dimensions = webpDimensions(bytes);
      if (bytes.length > 2048 || dimensions[0] !== 48 || dimensions[1] !== 48) {
        throw new Error(`Anchor exceeds size/dimension contract: ${record.recordId}: ${bytes.length} bytes, ${dimensions}`);
      }
      const temporary = `${target}.tmp-${process.pid}`;
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      entries[record.recordId] = {
        sourcePath, sourceSha256, sourceIntegrityReference: record.integrityReference,
        sha256: sha256(bytes), width: 48, height: 48, sizeBytes: bytes.length,
      };
      generated += 1;
    } catch (error) {
      stopped = true;
      throw error;
    }
  }
}
const manifestPath = join(output, "manifest.json");
try {
  const results = await Promise.allSettled([worker(), worker()]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  if (Object.keys(entries).length !== selected.length || selected.some((record) => !entries[record.recordId])) {
    throw new Error("Anchor generation did not cover the exact selected recording set");
  }
  const manifest = {
    schemaVersion: 1, sourceRevision: recordData.sourceRevision, processing,
    records: Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))),
  };
  await writeFile(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const stagedNames = new Set(await readdir(staging));
  if (stagedNames.size !== selected.length + 1 || !stagedNames.has("manifest.json") ||
      selected.some((record) => !stagedNames.has(`${record.recordId}.webp`))) {
    throw new Error("Staged files differ from the exact manifest coverage");
  }
  // A successful refresh replaces the directory as a set, so retired IDs cannot
  // leave obsolete WebPs. Preserve the old set until the new one is in place.
  if (outputExists) await rename(output, backup);
  try {
    await rename(staging, output);
    stagingExists = false;
  } catch (error) {
    if (outputExists) {
      try { await rename(backup, output); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Publish and rollback failed; previous complete output remains at ${backup}`);
      }
    }
    throw error;
  }
  if (outputExists) await removeBuildDirectory(backup);
} finally {
  if (stagingExists) await removeBuildDirectory(staging);
}
const sizes = Object.values(entries).map((entry) => entry.sizeBytes).sort((left, right) => left - right);
console.log(JSON.stringify({
  output, manifestPath, selected: selected.length, totalRecords: ids.length, partial: selected.length !== ids.length,
  generated, reused, totalBytes: sizes.reduce((total, size) => total + size, 0),
  minBytes: sizes[0], medianBytes: sizes[Math.floor(sizes.length / 2)], maxBytes: sizes.at(-1),
  elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(3)), ffmpegVersion,
}));
