import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error("Usage: node tools/extract-records.mjs <site.html> <records.json>");
}

const html = readFileSync(inputPath, "utf8");
const escapedRecords =
  html.match(
    /\{\\"recordId\\":\\"tla-[\s\S]*?\\"integrityReference\\":\\"[^\\"]+\\"\}/g,
  ) ?? [];

const records = escapedRecords.map((value) =>
  JSON.parse(value.replaceAll('\\"', '"')),
);

const unique = [...new Map(records.map((record) => [record.recordId, record])).values()]
  .sort((a, b) =>
    `${b.date}T${b.time ?? "00:00"}`.localeCompare(
      `${a.date}T${a.time ?? "00:00"}`,
    ),
  );

if (unique.length !== 357) {
  throw new Error(`Expected 357 records, found ${unique.length}`);
}

const payload = {
  generatedAt: "2026-08-20",
  sourceRepository: "maxwellinked/time-lapse-artifacts",
  sourceRevision: "46e0be60f606635ee2b627be911bc98ab46565d3",
  collection: "Standard_Time_Lapses",
  records: unique,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${unique.length} records to ${outputPath}`);
