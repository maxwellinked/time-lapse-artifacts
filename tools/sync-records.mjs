import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "maxwellinked/time-lapse-artifacts";
const COLLECTION = "Standard_Time_Lapses";
const root = fileURLToPath(new URL("../", import.meta.url));

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("metadata.csv ends inside a quoted field");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  if (!headers?.length) throw new Error("metadata.csv has no header row");
  return values
    .filter((columns) => columns.some(Boolean))
    .map((columns, rowIndex) => {
      if (columns.length !== headers.length) {
        throw new Error(
          `metadata.csv row ${rowIndex + 2} has ${columns.length} fields; expected ${headers.length}`,
        );
      }
      return {
        rowIndex,
        values: Object.fromEntries(headers.map((header, index) => [header, columns[index]])),
      };
    });
}

function pinnedVideoUrl(revision, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/datasets/${REPOSITORY}/resolve/${revision}/${encodedPath}`;
}

async function currentRevision() {
  const response = await fetch(`https://huggingface.co/api/datasets/${REPOSITORY}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Dataset info returned ${response.status}`);
  const payload = await response.json();
  return payload.sha;
}

const requestedRevision = option("--revision");
const revision = requestedRevision ?? (await currentRevision());
if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error(`Expected a full 40-character source revision, received ${revision}`);
}

const outputPath = option("--output") ?? join(root, "data", "records.json");
const metadataUrl = `https://huggingface.co/datasets/${REPOSITORY}/resolve/${revision}/metadata.csv`;
const metadataResponse = await fetch(metadataUrl, { cache: "no-store" });
if (!metadataResponse.ok) {
  throw new Error(`Pinned metadata.csv returned ${metadataResponse.status}`);
}

const metadata = parseCsv(await metadataResponse.text());
const canonicalRows = metadata.filter(({ values }) => {
  const canonical = values.is_canonical.toLowerCase() === "true";
  return (
    canonical &&
    values.collection_tier === "standard" &&
    values.file_name.startsWith(`${COLLECTION}/`) &&
    values.file_name.toLowerCase().endsWith(".mp4")
  );
});

const records = canonicalRows.map(({ rowIndex, values }) => {
  const required = [
    "file_name",
    "record_id",
    "date",
    "tool",
    "medium",
    "support",
    "dimensions",
    "duration_seconds",
    "orientation",
    "acquisition_protocol_version",
    "hub_xet_hash",
  ];
  for (const field of required) {
    if (!values[field]) throw new Error(`Canonical row ${rowIndex + 2} lacks ${field}`);
  }

  const durationSeconds = Number(values.duration_seconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Canonical row ${rowIndex + 2} has an invalid duration`);
  }
  if (!/^tla-[a-f0-9]{16}$/.test(values.record_id)) {
    throw new Error(`Canonical row ${rowIndex + 2} has an invalid record_id`);
  }
  if (!/^[a-f0-9]{64}$/.test(values.hub_xet_hash)) {
    throw new Error(`Canonical row ${rowIndex + 2} has an invalid hub_xet_hash`);
  }

  const videoUrl = pinnedVideoUrl(revision, values.file_name);
  return {
    recordId: values.record_id,
    rowIndex,
    videoUrl,
    sourceUrl: videoUrl,
    filename: basename(values.file_name),
    date: values.date,
    time: values.time || null,
    tool: values.tool,
    medium: values.medium,
    support: values.support,
    dimensions: values.dimensions,
    durationSeconds,
    orientation: values.orientation,
    captureType: values.acquisition_protocol_version,
    integrityReference: values.hub_xet_hash,
  };
});

records.sort((left, right) => {
  const rightDateTime = `${right.date}T${right.time ?? "00:00"}`;
  const leftDateTime = `${left.date}T${left.time ?? "00:00"}`;
  return rightDateTime.localeCompare(leftDateTime);
});

const uniqueIds = new Set(records.map((record) => record.recordId));
const uniquePaths = new Set(records.map((record) => record.sourceUrl));
const uniqueHashes = new Set(records.map((record) => record.integrityReference));
if (
  !records.length ||
  uniqueIds.size !== records.length ||
  uniquePaths.size !== records.length ||
  uniqueHashes.size !== records.length
) {
  throw new Error("Canonical records must have unique IDs, paths, and content identities");
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sourceRepository: REPOSITORY,
  sourceRevision: revision,
  collection: COLLECTION,
  records,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  JSON.stringify({
    output: outputPath,
    sourceRevision: revision,
    records: records.length,
    newestRecord: records[0]?.recordId,
    newestDate: records[0]?.date,
  }),
);
