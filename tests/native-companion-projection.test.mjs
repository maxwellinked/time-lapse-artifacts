import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TOOL = new URL("../tools/build-native-companions.mjs", import.meta.url);
const IDS = ["tla-0897038ffd1f516b", "tla-5fe34f800eee6bb4"];
const REVISION = "4b0870f45eac36c53b1084305934471ee8dd273b";
const ACCESS_REVISION = "a8de72f00be897f055f9290c5b366238656520f0";
const PROFILE = "artifacts/native-access-v1-2026-11-10";
const MANIFEST_SHA256 = "32a69b36cff7eb7fe24b92564e22981ef178a3e27b9838560ce6a205aa9a7a77";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function builder() {
  assert.ok(existsSync(TOOL), "a deterministic native-companion projection builder is required");
  return import(TOOL.href);
}

function inputs() {
  const manifestBytes = readFileSync(new URL("../inspection/native-source/manifest.json", import.meta.url));
  const manifest = JSON.parse(manifestBytes);
  const accessById = Object.fromEntries(IDS.map((id) => [id, readFileSync(new URL(`../inspection/native-source/access_manifests/${id}.json`, import.meta.url))]));
  return { manifest, accessById, manifestBytes };
}

function repack(input) {
  input.manifestBytes = Buffer.from(JSON.stringify(input.manifest));
  return input;
}

function build(module, input) {
  return module.buildNativeCompanions(input.manifest, input.accessById, input.manifestBytes);
}

test("the two-record projection preserves immutable source bindings, exact frame mapping and documentary nulls", async () => {
  const module = await builder();
  const input = inputs();
  const before = JSON.stringify(input.manifest);
  const result = build(module, input);
  assert.equal(result.schema, "native-inspection-projection/v1");
  assert.equal(result.derivedRepository, "maxwellinked/time-lapse-artifacts-derived");
  assert.equal(result.derivedRevision, REVISION);
  assert.equal(result.manifestPath, `${PROFILE}/manifest.json`);
  assert.equal(result.manifestSha256, MANIFEST_SHA256);
  assert.deepEqual(result.records.map(({ recordId }) => recordId), IDS);
  for (const record of result.records) {
    const native = input.manifest.records.find(({ record_id }) => record_id === record.recordId);
    const access = JSON.parse(input.accessById[record.recordId]);
    assert.equal(record.sourceSha256, access.source.downloaded_content_sha256);
    assert.equal(record.sourceXetHash, access.source.hub_xet_hash);
    assert.deepEqual(record.documentaryState, access.documentary_state);
    assert.equal(record.documentaryState.work_id, null);
    assert.equal(record.frames.length, 21);
    assert.deepEqual(record.frames.map(({ index }) => index), Array.from({ length: 21 }, (_, index) => index));
    assert.equal(record.accessManifestSha256, sha(input.accessById[record.recordId]));
    assert.equal(record.accessManifestUrl, `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts-derived/blob/${ACCESS_REVISION}/${native.access.manifest_path}`);
    assert.equal(record.proxyUrl, `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts-derived/resolve/${ACCESS_REVISION}/${native.access.proxy_path}`);
    for (const frame of record.frames) {
      const published = input.manifest.files.find((entry) => entry.record_id === record.recordId && entry.index === frame.index);
      assert.equal(frame.pts, published.pts);
      assert.equal(frame.timeBase, published.time_base);
      assert.deepEqual(frame.targetPts, published.target_pts);
      assert.equal(frame.url, `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts-derived/resolve/${REVISION}/${PROFILE}/${published.path}`);
      assert.equal(frame.sha256, published.sha256);
      assert.equal(frame.sizeBytes, published.size_bytes);
    }
  }
  assert.equal(result.records[0].frames[1].encodedSeconds, 16.483662);
  assert.equal(JSON.stringify(input.manifest), before, "projection must not mutate source metadata");
});

test("retained snapshots reproduce committed JSON and the small identity-guarded navigation index byte for byte", async () => {
  const module = await builder();
  const input = inputs();
  assert.equal(sha(input.manifestBytes), MANIFEST_SHA256);
  const projection = build(module, input);
  assert.equal(readFileSync(new URL("../inspection/native-data.json", import.meta.url), "utf8"), JSON.stringify(projection, null, 2) + "\n");
  const indexText = readFileSync(new URL("../assets/native-inspection-index.js", import.meta.url), "utf8");
  const links = await import(`data:text/javascript;base64,${Buffer.from(indexText).toString("base64")}`);
  assert.deepEqual(Object.keys(links.NATIVE_INSPECTION_LINKS).sort(), IDS);
  for (const record of projection.records) {
    assert.deepEqual(links.NATIVE_INSPECTION_LINKS[record.recordId], { sourceXetHash: record.sourceXetHash, url: `inspection/native.html?record=${record.recordId}` });
  }
  assert.equal(readFileSync(new URL("../assets/native-inspection-index.js", import.meta.url), "utf8"), module.renderNativeInspectionIndex(projection));
});

test("the builder rejects a manifest object that does not describe the exact supplied manifest bytes", async () => {
  const module = await builder();
  const input = inputs();
  input.manifest.records[0].source.size_bytes += 1;
  assert.throws(() => build(module, input), /manifest.*bytes|bytes.*manifest/i);
});

test("documentary and source substitutions fail against the exact copied access manifest", async () => {
  const module = await builder();
  for (const [section, field, value] of [["documentary_state", "work_id", "invented"], ["documentary_state", "capture_extent", "full_available_process"], ["source", "size_bytes", 1], ["source", "hub_xet_hash", "f".repeat(64)]]) {
    const input = inputs();
    input.manifest.records[0][section][field] = value;
    assert.throws(() => build(module, repack(input)), /source|documentary|binding/i);
  }
});

test("copied access bytes, derivation IDs and proxy paths must remain bound to the native record", async () => {
  const module = await builder();
  const badBytes = inputs();
  badBytes.accessById[IDS[0]] = Buffer.concat([badBytes.accessById[IDS[0]], Buffer.from(" ")]);
  assert.throws(() => build(module, badBytes), /access.*hash|SHA|digest/i);
  for (const [field, value] of [["derivation_id", "tla-deriv-" + "e".repeat(20)], ["proxy_path", "artifacts/elsewhere/proxy.mp4"], ["revision", "main"], ["manifest_path", "../escape.json"]]) {
    const input = inputs();
    input.manifest.records[0].access[field] = value;
    assert.throws(() => build(module, repack(input)));
  }
});

test("unsafe or extra record identities cannot become browser links", async () => {
  const module = await builder();
  for (const changed of ["../escape", "tla-0000000000000000", IDS[1]]) {
    const input = inputs();
    input.manifest.records[0].record_id = changed;
    assert.throws(() => build(module, repack(input)), /record|selection|batch/i);
  }
  const extra = inputs();
  extra.accessById["tla-0000000000000000"] = extra.accessById[IDS[0]];
  assert.throws(() => build(module, extra), /access|selection|batch/i);
});

test("frame paths, hashes, indices and dimensions retain their source-native bindings", async () => {
  const module = await builder();
  for (const [field, value] of [["path", "../escape.png"], ["path", `assets/${IDS[0]}/20.png`], ["source_sha256", "e".repeat(64)], ["sha256", "not-a-hash"], ["index", 1], ["width", 1280], ["size_bytes", "100"]]) {
    const input = inputs();
    input.manifest.files[0][field] = value;
    assert.throws(() => build(module, repack(input)));
  }
});

test("selected PTS are recomputed from exact targets and the entire sorted packet list", async () => {
  const module = await builder();
  const nextPacket = inputs();
  const record = nextPacket.manifest.records[0];
  const frame = nextPacket.manifest.files.find((entry) => entry.record_id === record.record_id && entry.index === 1);
  frame.pts = record.packet_pts[record.packet_pts.indexOf(frame.pts) + 1];
  assert.throws(() => build(module, repack(nextPacket)), /PTS|target|packet/i);
  for (const mutation of ["target", "packet_order", "normalized", "boolean_pts"]) {
    const input = inputs();
    if (mutation === "target") input.manifest.files[1].target_pts.numerator += 1;
    if (mutation === "packet_order") [input.manifest.records[0].packet_pts[0], input.manifest.records[0].packet_pts[1]] = [input.manifest.records[0].packet_pts[1], input.manifest.records[0].packet_pts[0]];
    if (mutation === "normalized") input.manifest.files[1].normalized_encoded_position = 0.5;
    if (mutation === "boolean_pts") input.manifest.files[1].pts = true;
    assert.throws(() => build(module, repack(input)), /PTS|position|packet|integer/i);
  }
});

test("selection cannot claim drawing time, drop targets or change the native sampling rule", async () => {
  const module = await builder();
  for (const [field, value] of [["real_drawing_time_claimed", true], ["frame_count", 20], ["position_basis", "wall_clock"], ["rule", "nearest_packet"]]) {
    const input = inputs();
    input.manifest.selection[field] = value;
    assert.throws(() => build(module, repack(input)), /selection|drawing|frame|position|rule/i);
  }
  const missing = inputs();
  missing.manifest.files.pop();
  assert.throws(() => build(module, repack(missing)), /frame|21/i);
});

test("source media paths encode every segment without losing a slash or treating filename characters as URL syntax", async () => {
  const module = await builder();
  const input = inputs();
  const record = input.manifest.records[0];
  const access = JSON.parse(input.accessById[record.record_id]);
  record.source.file_path = "Standard_Time_Lapses/drawing ?#% café.mp4";
  access.source.file_path = record.source.file_path;
  input.accessById[record.record_id] = Buffer.from(JSON.stringify(access));
  record.access.manifest_sha256 = sha(input.accessById[record.record_id]);
  const projection = build(module, repack(input));
  const encoded = "Standard_Time_Lapses/drawing%20%3F%23%25%20caf%C3%A9.mp4";
  assert.equal(projection.records[0].sourceUrl, `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${record.source.revision}/${encoded}`);
  assert.equal(projection.records[0].sourcePageUrl, `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/${record.source.revision}/${encoded}`);
});

test("generation is deterministic and the check command detects a stale projection without rewriting it", async (t) => {
  await builder();
  execFileSync(process.execPath, [fileURLToPath(TOOL), "--check"], { cwd: ROOT });
  const temporary = mkdtempSync(join(tmpdir(), "tla-native-projection-"));
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("tla-native-projection-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const directory of ["tools", "inspection/native-source/access_manifests", "assets"]) mkdirSync(join(temporary, directory), { recursive: true });
  for (const path of ["tools/build-native-companions.mjs", "inspection/native-source/manifest.json", ...IDS.map((id) => `inspection/native-source/access_manifests/${id}.json`), "inspection/native-data.json", "assets/native-inspection-index.js"]) copyFileSync(join(ROOT, path), join(temporary, path));
  const stalePath = join(temporary, "inspection/native-data.json");
  writeFileSync(stalePath, "{}\n");
  const checked = spawnSync(process.execPath, [join(temporary, "tools/build-native-companions.mjs"), "--check"], { encoding: "utf8" });
  assert.notEqual(checked.status, 0);
  assert.equal(readFileSync(stalePath, "utf8"), "{}\n");
  assert.match(checked.stderr, /stale|mismatch|regenerate/i);
});
