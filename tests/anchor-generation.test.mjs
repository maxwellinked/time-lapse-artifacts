import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const putJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

// Run the actual generators in isolated filesystem fixtures. Encoder doubles
// return committed WebPs so these orchestration/failure tests need no native
// dependencies or network; they do not test FFmpeg or Sharp's encoding quality.
async function fixture(t, kind) {
  const root = await mkdtemp(join(tmpdir(), "tla-anchor-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, `assets/${kind}-anchors`);
  for (const path of ["tools", "data", "previews", "reference-previews", `assets/${kind}-anchors`]) {
    await mkdir(join(root, path), { recursive: true });
  }
  const copy = async (path) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(repository, path), join(root, path));
  };
  const script = `tools/generate-${kind}-anchors.mjs`;
  await copy(script);
  await copy(`assets/${kind}-anchors/manifest.json`);
  const manifest = await json(join(output, "manifest.json"));
  let ids;
  if (kind === "record") {
    const records = await json(join(repository, "data/records.json"));
    records.records = records.records.slice(0, 3);
    ids = records.records.map(({ recordId }) => recordId);
    await putJson(join(root, "data/records.json"), records);
    const previews = await json(join(repository, "previews/manifest.json"));
    previews.records = ids.length;
    previews.recordIdentities = Object.fromEntries(ids.map((id) => [id, previews.recordIdentities[id]]));
    await putJson(join(root, "previews/manifest.json"), previews);
    manifest.records = Object.fromEntries([...ids].sort().map((id) => [id, manifest.records[id]]));
    await putJson(join(output, "manifest.json"), manifest);
    for (const id of ids) await copy(`previews/${id}.mp4`);
    const encoder = join(root, "ffmpeg-test.cjs");
    await writeFile(encoder, `#!${process.execPath}\n
const fs = require('node:fs');
if (process.argv.includes('-version')) console.log(process.env.TEST_FFMPEG_VERSION || ${JSON.stringify(manifest.processing.ffmpegVersion)});
else {
  if (process.env.TEST_NO_ENCODING === '1') throw new Error('Unexpected encoding of unchanged bytes');
  process.stdin.resume();
  process.stdin.on('end', () => process.stdout.write(fs.readFileSync(${JSON.stringify(join(repository, `assets/record-anchors/${ids[0]}.webp`))})));
}
`);
    await chmod(encoder, 0o755);
  } else {
    ids = Object.keys(manifest.images);
    for (const path of ["assets/reference-policy.js", "data/physical-references.json", "reference-previews/manifest.json"]) await copy(path);
    const previews = await json(join(root, "reference-previews/manifest.json"));
    const first = previews.images[ids[0]];
    for (const id of ids) {
      if (previews.images[id]) await copy(`reference-previews/${id}.jpg`);
      else {
        // Supply a third verified display-preview fixture, avoiding any download
        // of the small public original that is deliberately not stored in Git.
        previews.images[id] = { ...first, sourceUrl: manifest.images[id].sourceUrl };
        await copyFile(join(root, `reference-previews/${ids[0]}.jpg`), join(root, `reference-previews/${id}.jpg`));
      }
    }
    await putJson(join(root, "reference-previews/manifest.json"), previews);
    await mkdir(join(root, "node_modules/sharp"), { recursive: true });
    await writeFile(join(root, "node_modules/sharp/index.js"), `
const fs = require('node:fs');
function sharp() {
  const pipeline = {
    autoOrient() { return this; }, resize() { return this; }, withIccProfile() { return this; }, webp() { return this; },
    async toBuffer() {
      if (process.env.TEST_NO_ENCODING === '1') throw new Error('Unexpected encoding of unchanged bytes');
      return { data: fs.readFileSync(${JSON.stringify(join(repository, `assets/visual-anchors/${ids[0]}.webp`))}),
        info: ${JSON.stringify({ width: manifest.images[ids[0]].width, height: manifest.images[ids[0]].height })} };
    },
  };
  return pipeline;
}
sharp.versions = { sharp: '0.35.5', vips: '8.18.7' };
sharp.concurrency = () => {};
module.exports = sharp;
`);
  }
  for (const id of ids) await copy(`assets/${kind}-anchors/${id}.webp`);
  // Failure injection remains in the test subprocess, with no production flags.
  const hook = join(root, "failures.mjs");
  await writeFile(hook, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFile, rename = fs.rename;
let held = false;
fs.writeFile = async (path, ...args) => {
  if (process.env.TEST_FAIL_MANIFEST === '1' && String(path).endsWith('/manifest.json')) throw new Error('Injected manifest write failure');
  const result = await write(path, ...args);
  if (process.env.TEST_INTERRUPT === '1' && String(path).includes('.webp') && !held) {
    held = true;
    process.stdout.write('STAGED_IMAGE_READY\\n');
    await new Promise(() => setInterval(() => {}, 1000));
  }
  return result;
};
fs.rename = async (from, to) => {
  if (process.env.TEST_FAIL_PUBLISH === '1' && String(from).includes('-anchors-stage-') && String(to) === ${JSON.stringify(output)}) {
    throw new Error('Injected directory promotion failure');
  }
  return rename(from, to);
};
syncBuiltinESMExports();
`);
  const args = ["--import", hook, join(root, script)];
  if (kind === "record") args.push("--ffmpeg", join(root, "ffmpeg-test.cjs"));
  const env = (extra) => ({ ...process.env, VISUAL_ANCHOR_SOURCE_DIRECTORY: "", ...extra });
  const run = async (extra = {}) => JSON.parse((await exec(process.execPath, args, { env: env(extra), timeout: 15000 })).stdout);
  const snapshot = async (path = output) => Object.fromEntries(await Promise.all((await readdir(path)).sort()
    .map(async (name) => [name, hash(await readFile(join(path, name)))])));
  const clean = async () => assert.deepEqual((await readdir(join(root, "assets"))).filter((name) => name.startsWith(`.${kind}-anchors-`)), []);
  const forceRegeneration = async () => {
    const current = await json(join(output, "manifest.json"));
    current.processing = { ...current.processing, previousSettings: true };
    await putJson(join(output, "manifest.json"), current);
  };
  const interrupt = async () => {
    const child = spawn(process.execPath, args, { env: env({ TEST_INTERRUPT: "1" }), stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    let stdout = "", stderr = "";
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`No staged image: ${stderr}`)); }, 10000);
      child.stdout.on("data", (bytes) => {
        stdout += bytes;
        if (stdout.includes("STAGED_IMAGE_READY")) child.kill("SIGTERM");
      });
      child.stderr.on("data", (bytes) => { stderr += bytes; });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        clearTimeout(deadline);
        if (signal === "SIGTERM" && stdout.includes("STAGED_IMAGE_READY")) resolve();
        else reject(new Error(`Unexpected exit ${code}/${signal}: ${stderr}`));
      });
    });
  };
  return { root, output, ids, run, snapshot, clean, forceRegeneration, interrupt };
}

for (const kind of ["record", "visual"]) {
  test(`${kind} images: complete regeneration, hash binding and byte-identical cache reuse`, async (t) => {
    const f = await fixture(t, kind);
    const sourcePath = kind === "record" ? "previews" : "reference-previews";
    const inputs = await f.snapshot(join(f.root, sourcePath));
    await rm(f.output, { recursive: true });
    assert.equal((await f.run()).generated, 3);
    const manifest = await json(join(f.output, "manifest.json"));
    const entries = manifest.records ?? manifest.images;
    assert.deepEqual(Object.keys(entries).sort(), [...f.ids].sort());
    for (const [id, entry] of Object.entries(entries)) {
      const bytes = await readFile(join(f.output, `${id}.webp`));
      assert.equal(hash(bytes), entry.sha256);
      assert.equal(bytes.length, entry.sizeBytes);
      assert.equal(hash(await readFile(join(f.root, entry.sourcePath))), entry.sourceSha256);
    }
    const before = await f.snapshot();
    assert.equal((await f.run({ TEST_NO_ENCODING: "1" })).reused, 3);
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await f.snapshot(join(f.root, sourcePath)), inputs);
    await f.clean();
  });

  test(`${kind} images: missing input preserves the complete published set`, async (t) => {
    const f = await fixture(t, kind);
    await f.forceRegeneration();
    if (kind === "visual") {
      // Reproduce the review's exact late failure: two display JPEGs exist,
      // but the third small published original was not supplied locally.
      const path = join(f.root, "reference-previews/manifest.json"), previews = await json(path);
      delete previews.images[f.ids[2]];
      await putJson(path, previews);
    } else await rm(join(f.root, `previews/${f.ids[2]}.mp4`));
    const before = await f.snapshot();
    await assert.rejects(f.run(), kind === "visual" ? /VISUAL_ANCHOR_SOURCE_DIRECTORY/ : /ENOENT/);
    assert.deepEqual(await f.snapshot(), before);
    await f.clean();
  });

  test(`${kind} images: failed manifest write and failed promotion roll back completely`, async (t) => {
    const f = await fixture(t, kind);
    await f.forceRegeneration();
    const before = await f.snapshot();
    for (const flag of ["TEST_FAIL_MANIFEST", "TEST_FAIL_PUBLISH"]) {
      await assert.rejects(f.run({ [flag]: "1" }), /Injected/);
      assert.deepEqual(await f.snapshot(), before);
      await f.clean();
    }
  });

  test(`${kind} images: interrupted staged build preserves published bytes and can be retried`, async (t) => {
    const f = await fixture(t, kind);
    await f.forceRegeneration();
    const before = await f.snapshot();
    await f.interrupt();
    assert.deepEqual(await f.snapshot(), before);
    assert.equal((await f.run()).generated, 3);
    assert.equal(Object.keys(await f.snapshot()).length, 4);
    // SIGTERM can leave an isolated staging directory; it is never published
    // or consumed by the next build and fixture teardown removes it.
  });
}

test("recording refresh: new revision/count reuses unchanged images and stages both asset sets", async (t) => {
  const f = await fixture(t, "record");
  const workflow = await readFile(join(repository, ".github/workflows/generate-previews.yml"), "utf8");
  const motion = workflow.indexOf("run: node tools/generate-previews.mjs --concurrency 6");
  const anchors = workflow.indexOf("run: node tools/generate-record-anchors.mjs");
  const validation = workflow.indexOf("run: REQUIRE_PREVIEWS=1 node tools/validate.mjs");
  assert.ok(motion >= 0 && anchors > motion && validation > anchors, "generate both packs before strict validation");
  assert.match(workflow, /- tools\/generate-record-anchors\.mjs/);
  const publisher = await readFile(join(repository, "tools/publish-previews.sh"), "utf8");
  const stageCommand = publisher.match(/^(git add -- previews[^\n]*)$/m)?.[1];
  assert.ok(stageCommand?.includes("assets/record-anchors"));
  await exec("git", ["init", "-q", f.root]);
  await exec("git", ["add", "--", "previews", "assets/record-anchors"], { cwd: f.root });
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Fixture"], { cwd: f.root });
  const before = await f.snapshot();
  const indexPath = join(f.root, "data/records.json"), records = await json(indexPath);
  const previewPath = join(f.root, "previews/manifest.json"), previews = await json(previewPath);
  records.sourceRevision = "0".repeat(40);
  await putJson(indexPath, records);
  await assert.rejects(f.run(), /revision or exact record coverage differs/);
  assert.deepEqual(await f.snapshot(), before);
  previews.sourceRevision = records.sourceRevision;
  await putJson(previewPath, previews);
  assert.equal((await f.run({ TEST_NO_ENCODING: "1" })).reused, 3);
  assert.equal((await json(join(f.output, "manifest.json"))).sourceRevision, records.sourceRevision);
  for (const id of f.ids) assert.equal((await f.snapshot())[`${id}.webp`], before[`${id}.webp`]);
  // Add one recording and retire another; retained identities must not encode.
  const newId = "tla-0000000000000000", retired = records.records.pop();
  records.records.push({ ...records.records[0], recordId: newId, integrityReference: "new-content-identity" });
  records.records.push({ ...retired, recordId: "tla-1111111111111111" });
  previews.records = records.records.length;
  previews.recordIdentities = Object.fromEntries(records.records.map((r) => [r.recordId, r.integrityReference]));
  await putJson(indexPath, records);
  await putJson(previewPath, previews);
  await rm(join(f.root, `previews/${retired.recordId}.mp4`));
  for (const id of [newId, "tla-1111111111111111"]) await copyFile(join(f.root, `previews/${f.ids[0]}.mp4`), join(f.root, `previews/${id}.mp4`));
  const result = await f.run();
  assert.equal(result.generated, 2);
  assert.equal(result.reused, 2);
  const current = await json(join(f.output, "manifest.json"));
  assert.deepEqual(Object.keys(current.records).sort(), records.records.map((r) => r.recordId).sort());
  assert.ok(!(await readdir(f.output)).includes(`${retired.recordId}.webp`));
  for (const id of f.ids.slice(0, 2)) assert.equal((await f.snapshot())[`${id}.webp`], before[`${id}.webp`]);
  await exec("bash", ["-c", stageCommand], { cwd: f.root });
  const staged = (await exec("git", ["diff", "--cached", "--name-only"], { cwd: f.root })).stdout.split("\n");
  for (const path of ["previews/manifest.json", "assets/record-anchors/manifest.json", `assets/record-anchors/${newId}.webp`, `assets/record-anchors/${retired.recordId}.webp`]) assert.ok(staged.includes(path), path);
  await f.clean();
});

test("recording cache rejects changed source bytes and changed recording identities", async (t) => {
  const f = await fixture(t, "record");
  await writeFile(join(f.root, `previews/${f.ids[0]}.mp4`), "changed preview bytes");
  const path = join(f.root, "data/records.json"), records = await json(path);
  const previewPath = join(f.root, "previews/manifest.json"), previews = await json(previewPath);
  records.records[1].integrityReference = "changed-content-identity";
  await putJson(path, records);
  await assert.rejects(f.run(), /Preview identity differs/);
  previews.recordIdentities[f.ids[1]] = records.records[1].integrityReference;
  await putJson(previewPath, previews);
  const result = await f.run({ TEST_FFMPEG_VERSION: "ffmpeg version 6.1.1-test" });
  assert.equal(result.generated, 2);
  assert.equal(result.reused, 1);
});

test("recording images: a different encoder preserves all verified bytes and original provenance", async (t) => {
  const f = await fixture(t, "record"), before = await f.snapshot();
  const result = await f.run({ TEST_FFMPEG_VERSION: "ffmpeg version 6.1.1-test", TEST_NO_ENCODING: "1" });
  assert.equal(result.generated, 0);
  assert.equal(result.reused, 3);
  assert.deepEqual(await f.snapshot(), before, "including the original manifest bytes");
});

test("recording images: damage and changed image settings still require regeneration", async (t) => {
  const f = await fixture(t, "record");
  await writeFile(join(f.output, `${f.ids[0]}.webp`), "damaged derivative");
  const result = await f.run({ TEST_FFMPEG_VERSION: "ffmpeg version 6.1.1-test" });
  assert.equal(result.generated, 1);
  assert.equal(result.reused, 2);
  await f.forceRegeneration();
  assert.equal((await f.run()).generated, 3);
});

test("new recording: generate its motion preview and image while preserving older encodes", async (t) => {
  const f = await fixture(t, "record"), before = await f.snapshot();
  const oldManifest = await json(join(f.output, "manifest.json"));
  await copyFile(join(repository, "tools/generate-previews.mjs"), join(f.root, "tools/generate-previews.mjs"));
  const bin = join(f.root, "bin"), log = join(f.root, "motion-calls.jsonl");
  await mkdir(bin);
  // Exercise the actual preview cache/orchestration without fetching source video.
  await writeFile(join(bin, "ffmpeg"), `#!${process.execPath}\n
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
fs.copyFileSync(${JSON.stringify(join(f.root, `previews/${f.ids[0]}.mp4`))}, process.argv.at(-1));
`);
  await chmod(join(bin, "ffmpeg"), 0o755);
  const path = join(f.root, "data/records.json"), index = await json(path);
  const id = "tla-0000000000000000", record = { ...index.records[0], recordId: id, integrityReference: "new-source-identity" };
  index.sourceRevision = "1".repeat(40);
  index.records.push(record);
  await putJson(path, index);
  await exec(process.execPath, [join(f.root, "tools/generate-previews.mjs")], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, timeout: 15000,
  });
  const calls = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].at(-1), join(f.root, `previews/${id}.mp4.part.mp4`));
  assert.equal(calls[0][calls[0].indexOf("-i") + 1], record.videoUrl);
  const result = await f.run({ TEST_FFMPEG_VERSION: "ffmpeg version 6.1.1-test" });
  assert.equal(result.generated, 1);
  assert.equal(result.reused, 3);
  const current = await json(join(f.output, "manifest.json"));
  assert.deepEqual(current.processing, oldManifest.processing);
  assert.equal(current.records[id].ffmpegVersion, "ffmpeg version 6.1.1-test");
  assert.equal(current.records[id].sourceIntegrityReference, record.integrityReference);
  assert.equal(current.records[id].sourceSha256, hash(await readFile(join(f.root, `previews/${id}.mp4`))));
  for (const oldId of f.ids) {
    assert.deepEqual(current.records[oldId], oldManifest.records[oldId]);
    assert.equal((await f.snapshot())[`${oldId}.webp`], before[`${oldId}.webp`]);
  }
  const mixedSnapshot = await f.snapshot();
  assert.equal((await f.run({ TEST_FFMPEG_VERSION: "ffmpeg version 7-test", TEST_NO_ENCODING: "1" })).reused, 4);
  assert.deepEqual(await f.snapshot(), mixedSnapshot, "mixed encoder provenance survives the next cache-only run");
});
