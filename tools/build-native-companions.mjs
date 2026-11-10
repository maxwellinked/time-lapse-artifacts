import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ROOT = new URL("../", import.meta.url);
export const DERIVED_REPOSITORY = "maxwellinked/time-lapse-artifacts-derived";
export const DERIVED_REVISION = "4b0870f45eac36c53b1084305934471ee8dd273b";
export const PROFILE = "artifacts/native-access-v1-2026-11-10";
export const EXPECTED_RECORD_IDS = Object.freeze(["tla-0897038ffd1f516b", "tla-5fe34f800eee6bb4"]);
const SOURCE_REPOSITORY = "maxwellinked/time-lapse-artifacts";
const SOURCE_REVISION = "46e0be60f606635ee2b627be911bc98ab46565d3";
const ACCESS_REVISION = "a8de72f00be897f055f9290c5b366238656520f0";
const RETAINED_MANIFEST_SHA256 = "32a69b36cff7eb7fe24b92564e22981ef178a3e27b9838560ce6a205aa9a7a77";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  require(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function integer(value, label, minimum = -Number.MAX_SAFE_INTEGER) {
  require(Number.isSafeInteger(value) && value >= minimum, `${label} must be a safe integer`);
  return value;
}

function match(value, pattern, label) {
  require(typeof value === "string" && pattern.test(value), `Invalid ${label}`);
  return value;
}

function safePath(value, label) {
  require(typeof value === "string" && value.length > 0 && !/[\\:\x00-\x1f]/u.test(value), `Unsafe ${label}`);
  require(value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), `Unsafe ${label}`);
  return value;
}

function hubUrl(repository, revision, path, view = "resolve") {
  match(repository, /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u, "repository");
  match(revision, /^[0-9a-f]{40}$/u, "immutable revision");
  safePath(path, "Hub path");
  return `https://huggingface.co/datasets/${repository}/${view}/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function jsonBytes(value, label) {
  require(value instanceof Uint8Array, `${label} must retain its exact JSON bytes`);
  const bytes = Buffer.from(value);
  // Round-trip UTF-8 rather than silently accepting replacement characters.
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { bytes, data: JSON.parse(text) };
}

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function reduced(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function timeBase(value) {
  match(value, /^[1-9][0-9]*\/[1-9][0-9]*$/u, "time base");
  const [numerator, denominator] = value.split("/").map(BigInt);
  return [numerator, denominator];
}

function firstEligiblePacket(packets, numerator, denominator) {
  let low = 0;
  let high = packets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (BigInt(packets[middle]) * denominator < numerator) low = middle + 1;
    else high = middle;
  }
  return packets[low];
}

/** Project verified published JSON; this function neither fetches nor verifies PNG bytes. */
export function buildNativeCompanions(manifest, accessById, manifestBytes) {
  const retained = jsonBytes(manifestBytes, "Native manifest");
  require(isDeepStrictEqual(manifest, retained.data), "Native manifest differs from its exact supplied bytes");
  object(manifest, "Native manifest");
  require(manifest.schema === "inspection-native-frame-pack/v2", "Unsupported native manifest schema");
  require(manifest.profile === PROFILE, "Native profile differs from the pinned companion selection");
  require(manifest.source_repository === SOURCE_REPOSITORY && manifest.source_revision === SOURCE_REVISION, "Native source repository/revision binding mismatch");
  object(manifest.generator, "Native generator");
  require(["name", "version", "ffmpeg_version"].every((field) => typeof manifest.generator[field] === "string" && manifest.generator[field].trim()), "Incomplete native generator identity");
  const selection = object(manifest.selection, "Native selection");
  require(selection.frame_count === 21, "Native selection must retain all 21 frame positions");
  require(selection.position_basis === "first_to_last_packet_pts", "Native position basis mismatch");
  require(selection.rule === "first_packet_pts_at_or_after_target", "Native selection rule mismatch");
  require(selection.real_drawing_time_claimed === false, "Native selection cannot claim real drawing time");
  require(Array.isArray(manifest.records) && Array.isArray(manifest.files), "Native records and frames must be arrays");
  const ids = manifest.records.map((record) => match(record?.record_id, /^tla-[0-9a-f]{16}$/u, "native record ID"));
  require(isDeepStrictEqual([...ids].sort(), EXPECTED_RECORD_IDS), "Native records differ from the exact two-record selection");
  object(accessById, "Copied access manifests");
  require(isDeepStrictEqual(Object.keys(accessById).sort(), EXPECTED_RECORD_IDS), "Copied access manifests differ from the selected batch");
  require(manifest.files.length === 42, "Native frame selection must contain exactly 42 frames");
  const nativeById = new Map(manifest.records.map((record) => [record.record_id, record]));
  for (const frame of manifest.files) require(nativeById.has(frame?.record_id), "Native frame belongs to an unselected record");
  const records = EXPECTED_RECORD_IDS.map((recordId) => {
    const record = nativeById.get(recordId);
    const binding = object(record.access, "Access binding");
    const copied = jsonBytes(accessById[recordId], "Copied access manifest");
    match(binding.manifest_sha256, /^[0-9a-f]{64}$/u, "access manifest SHA-256");
    require(sha256(copied.bytes) === binding.manifest_sha256, "Copied access manifest hash mismatch");
    const access = object(copied.data, "Copied access manifest");
    require(access.manifest_version === "1.0.0", "Unsupported copied access manifest schema");
    const source = object(access.source, "Copied source binding");
    require(isDeepStrictEqual(record.source, source), "Native source facts differ from copied access binding");
    require(isDeepStrictEqual(record.documentary_state, access.documentary_state), "Native documentary state differs from copied access binding");
    object(record.documentary_state, "Documentary state");
    require(source.record_id === recordId && source.repo_id === SOURCE_REPOSITORY && source.revision === SOURCE_REVISION, "Source identity/revision binding mismatch");
    require(["standard", "pre_standard"].includes(source.collection_tier), "Invalid source collection tier");
    safePath(source.file_path, "source media path");
    for (const field of ["downloaded_content_sha256", "hub_lfs_sha256", "hub_xet_hash"]) match(source[field], /^[0-9a-f]{64}$/u, `source ${field}`);
    require(source.downloaded_content_sha256 === source.hub_lfs_sha256, "Source SHA-256 identities disagree");
    integer(source.size_bytes, "Source size", 1);
    require(typeof source.metadata_duration_seconds === "number" && Number.isFinite(source.metadata_duration_seconds) && source.metadata_duration_seconds > 0, "Invalid source duration");
    require(typeof source.source_has_audio === "boolean", "Invalid source audio field");
    object(source.probed, "Source technical metadata");
    require(binding.repo_id === DERIVED_REPOSITORY && binding.revision === ACCESS_REVISION, "Access repository/revision binding mismatch");
    safePath(binding.manifest_path, "access manifest path");
    const suffix = `records/${recordId}/manifest.json`;
    require(binding.manifest_path === suffix || binding.manifest_path.endsWith(`/${suffix}`), "Access manifest path does not match its record");
    const prefix = binding.manifest_path.slice(0, -suffix.length);
    match(binding.derivation_id, /^tla-deriv-[0-9a-f]{20}$/u, "derivation ID");
    require(binding.derivation_id === access.derivation_id, "Access derivation ID binding mismatch");
    const proxy = object(access.proxy, "Existing access proxy");
    require(proxy.path === `records/${recordId}/proxy.mp4`, "Access proxy path does not match its record");
    require(binding.proxy_path === prefix + proxy.path, "Access proxy path binding mismatch");
    safePath(binding.proxy_path, "access proxy path");
    require(Array.isArray(record.packet_pts) && record.packet_pts.length > 0, "Packet PTS list must be nonempty");
    for (let index = 0; index < record.packet_pts.length; index++) {
      integer(record.packet_pts[index], "Packet PTS");
      require(index === 0 || record.packet_pts[index] > record.packet_pts[index - 1], "Packet PTS must be sorted and unique");
    }
    const [timeNumerator, timeDenominator] = timeBase(record.time_base);
    const rotation = integer(record.declared_display_rotation_degrees, "Declared display rotation");
    require(rotation % 90 === 0, "Declared display rotation must be a multiple of 90");
    const codedWidth = integer(record.coded_width, "Coded width", 1);
    const codedHeight = integer(record.coded_height, "Coded height", 1);
    require(codedWidth === source.probed.width && codedHeight === source.probed.height, "Native dimensions differ from source binding");
    const width = integer(record.decoded_width, "Decoded width", 1);
    const height = integer(record.decoded_height, "Decoded height", 1);
    require(width === (rotation % 180 ? codedHeight : codedWidth) && height === (rotation % 180 ? codedWidth : codedHeight), "Native decoded dimensions/rotation mismatch");
    const nativeFrames = manifest.files.filter((frame) => frame.record_id === recordId);
    require(nativeFrames.length === 21, "Each native record must retain 21 frames");
    const frames = nativeFrames.map((frame, index) => {
      require(integer(frame.index, "Frame index", 0) === index, "Native frame indices must retain their ordered 21 positions");
      require(frame.path === `assets/${recordId}/${String(index).padStart(2, "0")}.png`, "Noncanonical native frame path");
      require(typeof frame.normalized_encoded_position === "number" && frame.normalized_encoded_position === index / 20, "Normalized encoded position differs from index");
      require(frame.source_sha256 === source.downloaded_content_sha256, "Native frame source SHA-256 binding mismatch");
      match(frame.sha256, /^[0-9a-f]{64}$/u, "native frame SHA-256");
      integer(frame.size_bytes, "Native frame byte size", 1);
      require(integer(frame.width, "Native frame width", 1) === width && integer(frame.height, "Native frame height", 1) === height, "Native frame dimensions mismatch");
      require(frame.time_base === record.time_base, "Native frame time base mismatch");
      require(integer(frame.declared_display_rotation_degrees, "Frame display rotation") === rotation, "Native frame rotation mismatch");
      const first = BigInt(record.packet_pts[0]);
      const last = BigInt(record.packet_pts.at(-1));
      const [targetNumerator, targetDenominator] = reduced(first * 20n + BigInt(index) * (last - first), 20n);
      const target = object(frame.target_pts, "Rational target PTS");
      require(Object.keys(target).length === 2 && Object.hasOwn(target, "numerator") && Object.hasOwn(target, "denominator"), "Invalid rational target PTS fields");
      integer(target.numerator, "Target PTS numerator");
      integer(target.denominator, "Target PTS denominator", 1);
      require(BigInt(target.numerator) === targetNumerator && BigInt(target.denominator) === targetDenominator, "Native target PTS differs from exact reduced interpolation");
      const pts = integer(frame.pts, "Selected frame PTS");
      require(pts === firstEligiblePacket(record.packet_pts, targetNumerator, targetDenominator), "Selected PTS is not the first eligible packet at the target");
      const encodedSeconds = Number(BigInt(pts) * timeNumerator) / Number(timeDenominator);
      require(Number.isFinite(encodedSeconds), "Selected PTS produces nonfinite encoded seconds");
      return {
        index,
        normalizedEncodedPosition: frame.normalized_encoded_position,
        pts,
        timeBase: frame.time_base,
        encodedSeconds,
        width,
        height,
        sha256: frame.sha256,
        sizeBytes: frame.size_bytes,
        url: hubUrl(DERIVED_REPOSITORY, DERIVED_REVISION, `${PROFILE}/${frame.path}`),
        targetPts: structuredClone(frame.target_pts),
      };
    });
    return {
      recordId,
      collectionTier: source.collection_tier,
      filePath: source.file_path,
      sourceRevision: source.revision,
      sourceRepository: source.repo_id,
      sourceSha256: source.downloaded_content_sha256,
      sourceXetHash: source.hub_xet_hash,
      sourceUrl: hubUrl(source.repo_id, source.revision, source.file_path),
      sourcePageUrl: hubUrl(source.repo_id, source.revision, source.file_path, "blob"),
      accessManifestUrl: hubUrl(binding.repo_id, binding.revision, binding.manifest_path, "blob"),
      accessManifestSha256: binding.manifest_sha256,
      proxyUrl: hubUrl(binding.repo_id, binding.revision, binding.proxy_path),
      documentaryState: structuredClone(record.documentary_state),
      frames,
    };
  });
  return {
    schema: "native-inspection-projection/v1",
    derivedRepository: DERIVED_REPOSITORY,
    derivedRevision: DERIVED_REVISION,
    profile: PROFILE,
    manifestPath: `${PROFILE}/manifest.json`,
    manifestSha256: sha256(retained.bytes),
    sourceRepository: manifest.source_repository,
    sourceRevision: manifest.source_revision,
    records,
  };
}

export function renderNativeInspectionIndex(projection) {
  const links = Object.fromEntries(projection.records.map(({ recordId, sourceXetHash }) => [recordId, {
    sourceXetHash,
    url: `inspection/native.html?record=${recordId}`,
  }]));
  return `// Generated by tools/build-native-companions.mjs from immutable published JSON.\n// Native revision: ${DERIVED_REVISION}; manifest SHA-256: ${projection.manifestSha256}.\nexport const NATIVE_INSPECTION_LINKS = Object.freeze(${JSON.stringify(links, null, 2)});\n`;
}

function retainedSources() {
  const snapshot = new URL("inspection/native-source/", ROOT);
  require(isDeepStrictEqual(readdirSync(snapshot).sort(), ["access_manifests", "manifest.json"]), "Retained native snapshot inventory mismatch");
  const expected = EXPECTED_RECORD_IDS.map((id) => `${id}.json`);
  require(isDeepStrictEqual(readdirSync(new URL("access_manifests/", snapshot)).sort(), expected), "Retained access snapshot inventory mismatch");
  const manifestBytes = readFileSync(new URL("manifest.json", snapshot));
  require(sha256(manifestBytes) === RETAINED_MANIFEST_SHA256, "Retained native manifest SHA-256 differs from the pinned published snapshot");
  const manifest = jsonBytes(manifestBytes, "Retained native manifest").data;
  const accessById = Object.fromEntries(EXPECTED_RECORD_IDS.map((id) => [id, readFileSync(new URL(`access_manifests/${id}.json`, snapshot))]));
  return { manifest, accessById, manifestBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  require(args.length === 0 || (args.length === 1 && args[0] === "--check"), "Usage: node tools/build-native-companions.mjs [--check]");
  const input = retainedSources();
  const projection = buildNativeCompanions(input.manifest, input.accessById, input.manifestBytes);
  const outputs = [
    [new URL("inspection/native-data.json", ROOT), JSON.stringify(projection, null, 2) + "\n"],
    [new URL("assets/native-inspection-index.js", ROOT), renderNativeInspectionIndex(projection)],
  ];
  if (args[0] === "--check") {
    for (const [path, text] of outputs) require(readFileSync(path, "utf8") === text, `Native companion projection is stale; regenerate ${path.pathname.split("/").at(-1)}`);
    console.log("CHECK PASS: native companion projection matches retained published snapshots (2 records, 42 frames)");
  } else {
    for (const [path, text] of outputs) writeFileSync(path, text, "utf8");
    console.log("Wrote native companion projection and navigation index (2 records, 42 frames)");
  }
}
