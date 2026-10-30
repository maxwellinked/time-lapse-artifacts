import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const importer = new URL("../tools/sync-records.mjs", import.meta.url).href;
const revision = "0123456789abcdef0123456789abcdef01234567";
const metadataUrl = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${revision}/metadata.csv`;
const fields = [
  "is_canonical", "collection_tier", "file_name", "record_id", "date", "time",
  "tool", "medium", "support", "dimensions", "duration_seconds", "orientation",
  "acquisition_protocol_version", "hub_xet_hash",
];
const row = {
  is_canonical: "true",
  collection_tier: "standard",
  file_name: "Standard_Time_Lapses/2026-10/Rec01 & detail.mp4",
  record_id: "tla-0000000000000001",
  date: "2026-10-20",
  time: "11:30",
  tool: "pen",
  medium: "ink",
  support: "paper",
  dimensions: "21 x 29.7 cm",
  duration_seconds: "12.5",
  orientation: "portrait",
  acquisition_protocol_version: "protocol-v1",
  hub_xet_hash: "a".repeat(64),
  recording_mode: "time_lapse",
};

function csv(rows, explicitMode) {
  const columns = explicitMode ? [...fields, "recording_mode"] : fields;
  const quote = (value) => /[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${columns.join(",")}\r\n${rows.map((values) => columns.map((field) => quote(values[field])).join(",")).join("\r\n")}\r\n`;
}

function fixture(t, rows = [row], { explicitMode = true, existingOutput } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "tla-sync-records-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, "metadata.csv");
  const output = join(directory, "records.json");
  writeFileSync(input, csv(rows, explicitMode));
  if (existingOutput !== undefined) writeFileSync(output, existingOutput);
  const run = () => spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { readFileSync } from "node:fs";
    const [input, output] = process.argv.slice(1);
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json")) return new Response("", {status: 404});
      if (url !== ${JSON.stringify(metadataUrl)}) throw new Error("Unexpected request: " + url);
      return new Response(readFileSync(input, "utf8"), { headers: { "Content-Type": "text/csv" } });
    };
    process.argv = [process.execPath, ${JSON.stringify(importer)}, "--revision", ${JSON.stringify(revision)}, "--output", output];
    await import(${JSON.stringify(importer)});
  `, input, output], { encoding: "utf8", timeout: 10000 });
  return { output, run };
}

test("Standard sync accepts an explicit time_lapse mode while preserving record fields, ordering and pinned URLs", (t) => {
  const newer = {
    ...row,
    file_name: "Standard_Time_Lapses/2026-10/Rec02.mp4",
    record_id: "tla-0000000000000002",
    date: "2026-10-24",
    time: "",
    acquisition_protocol_version: "protocol-v2",
    hub_xet_hash: "b".repeat(64),
  };
  const ignored = { ...row, is_canonical: "false", recording_mode: "real_time" };
  const f = fixture(t, [row, ignored, newer]);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const payload = JSON.parse(readFileSync(f.output, "utf8"));
  const firstUrl = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${revision}/Standard_Time_Lapses/2026-10/Rec01%20%26%20detail.mp4`;
  const secondUrl = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${revision}/Standard_Time_Lapses/2026-10/Rec02.mp4`;
  assert.equal(payload.sourceRepository, "maxwellinked/time-lapse-artifacts");
  assert.equal(payload.sourceRevision, revision);
  assert.equal(payload.collection, "Standard_Time_Lapses");
  assert.deepEqual(payload.records, [
    {
      recordId: "tla-0000000000000002", rowIndex: 2,
      videoUrl: secondUrl, sourceUrl: secondUrl, filename: "Rec02.mp4",
      date: "2026-10-24", time: null, tool: "pen", medium: "ink", support: "paper",
      dimensions: "21 x 29.7 cm", durationSeconds: 12.5, orientation: "portrait",
      recordingMode: "time_lapse", captureType: "protocol-v2", integrityReference: "b".repeat(64),
    },
    {
      recordId: "tla-0000000000000001", rowIndex: 0,
      videoUrl: firstUrl, sourceUrl: firstUrl, filename: "Rec01 & detail.mp4",
      date: "2026-10-20", time: "11:30", tool: "pen", medium: "ink", support: "paper",
      dimensions: "21 x 29.7 cm", durationSeconds: 12.5, orientation: "portrait",
      recordingMode: "time_lapse", captureType: "protocol-v1", integrityReference: "a".repeat(64),
    },
  ]);
});

test("Standard sync supports legacy revision-pinned CSVs with no recording_mode column", (t) => {
  const f = fixture(t, [row], { explicitMode: false });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const payload = JSON.parse(readFileSync(f.output, "utf8"));
  assert.equal(payload.sourceRevision, revision);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].recordingMode, "time_lapse");
  assert.equal(payload.records[0].captureType, "protocol-v1");
});

for (const mode of ["", "real_time", "time-lapse", "TIME_LAPSE", " time_lapse", "time_lapse "]) {
  test(`Standard sync refuses to publish an explicit recording_mode of ${JSON.stringify(mode)}`, (t) => {
    const f = fixture(t, [{ ...row, recording_mode: mode }]);
    const result = f.run();
    assert.notEqual(result.status, 0, "Invalid explicit recording_mode must fail the import");
    assert.match(result.stderr, /recording_mode/);
    assert.equal(existsSync(f.output), false, "An invalid source must not create output");
  });
}

test("Standard sync preserves an existing output when a later canonical row has an invalid mode", (t) => {
  const existingOutput = '{"previous":"reviewed snapshot"}\n';
  const invalid = {
    ...row,
    file_name: "Standard_Time_Lapses/2026-10/Rec02.mp4",
    record_id: "tla-0000000000000002",
    hub_xet_hash: "b".repeat(64),
    recording_mode: "real_time",
  };
  const f = fixture(t, [row, invalid], { existingOutput });
  const result = f.run();
  assert.notEqual(result.status, 0, "An invalid later row must fail the entire import");
  assert.match(result.stderr, /Canonical row 3.*recording_mode/);
  assert.equal(readFileSync(f.output, "utf8"), existingOutput);
});


test("Standard sync rejects insertion filenames without an authoritative registry before replacing output", (t) => {
  const existingOutput = '{"previous":"reviewed snapshot"}\n';
  const f = fixture(t, [{...row, file_name:"Standard_Time_Lapses/2026-10-25.0938.BallpointPen.Ink.Paper.9x12.Rec03a.mp4"}], {existingOutput});
  const result = f.run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/insertion|projection/);
  assert.equal(readFileSync(f.output,"utf8"),existingOutput);
});
