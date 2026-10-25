import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./parse-csv.mjs";
import { REAL_TIME_REPOSITORY, REAL_TIME_FIELDS, validateRealTimePayload, realTimeSourceUrl, realTimeStatusLabel, realTimeDisplayFilename } from "../assets/real-time-recordings.js";

const ROOT = new URL("../", import.meta.url);
const INPUT_PATHS = ["Real_Time_Recordings/metadata.csv","Real_Time_Recordings/SHA256SUMS","Real_Time_Recordings/README.md","Real_Time_Recordings/SCHEMA.md"];
const sha256 = b => createHash("sha256").update(b).digest("hex");
const escape = v => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function buildRealTimeProjection(recordData, {manifest, csv, sums}) {
  if (manifest.sourceRepository !== REAL_TIME_REPOSITORY || manifest.sourceRevision !== recordData.sourceRevision) throw new Error("Real-time source snapshot mismatch");
  for (const [path,bytes] of [[INPUT_PATHS[0],csv],[INPUT_PATHS[1],sums]]) {
    if (manifest.inputs?.[path]?.sha256 !== sha256(bytes) || manifest.inputs[path].sizeBytes !== bytes.length) throw new Error(`Real-time source hash binding mismatch: ${path}`);
  }
  const rows = parseCsv(csv.toString("utf8"));
  if (!rows.length) throw new Error("Real-time source metadata is empty");
  const sourceFields = Object.keys(rows[0].values);
  if (!REAL_TIME_FIELDS.every(f => sourceFields.includes(f))) throw new Error("Real-time source fields are incomplete");
  const hasSourceMode = sourceFields.includes("recording_mode");
  const checksums = new Map();
  for (const line of sums.toString("utf8").split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})  (Real_Time_Recordings\/[^\r\n]+)$/);
    if (!match || checksums.has(match[2])) throw new Error("Invalid or duplicate real-time checksum entry");
    checksums.set(match[2], match[1]);
  }
  if (checksums.size !== rows.length) throw new Error("Real-time checksum coverage mismatch");
  const records = rows.map(({values}) => {
    if (checksums.get(values.file_name) !== values.sha256) throw new Error(`Real-time SHA-256 mismatch: ${values.file_name}`);
    // Preserve an explicit source mode so validation rejects contradictions or blanks.
    // Older pinned indexes predate this field and use the documented collection.
    return hasSourceMode ? {...values} : {...values, recording_mode:"real_time"};
  });
  return validateRealTimePayload({schemaVersion:1, sourceRepository:REAL_TIME_REPOSITORY, sourceRevision:manifest.sourceRevision,
    collection:"Real_Time_Recordings", recordingModeBasis:hasSourceMode ? "source_metadata" : "documented_collection",
    sourceInputs:manifest.inputs, sourceFields, records}, recordData);
}

export function buildRealTimePage(payload, recordData) {
  validateRealTimePayload(payload, recordData);
  const revision = payload.sourceRevision, byId = new Map(recordData.records.map(r => [r.recordId,r]));
  const source = (path, view="blob") => escape(realTimeSourceUrl(revision,path,view));
  const entry = (label,value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const articles = payload.records.map(r => {
    const target = byId.get(r.paired_record_id);
    const related = target ? `<a href="./#record=${escape(target.recordId)}">${escape(target.filename)}</a> <code>${escape(target.recordId)}</code>`
      : r.paired_record_id ? `<code>${escape(r.paired_record_id)}</code> — not included in this Standard browser snapshot` : "No related recording listed in the source index";
    return `<article id="${escape(r.record_id)}">
<h2>${escape(realTimeDisplayFilename(r))}</h2><p class="record-id"><strong>Real-time</strong> · <code>${escape(r.record_id)}</code></p>
<p><a href="${source(r.file_name,"resolve")}">Open source MOV (${(Number(r.size_bytes)/1e9).toFixed(2)} GB)</a></p>
<div class="relationship"><h3>Related time-lapse recording</h3><p>${related}</p><p><strong>${escape(realTimeStatusLabel(r.pairing_status))}</strong></p></div>
<dl class="metadata">
${entry("Recording mode","Real-time")}${entry("Encoded video duration",r.duration_seconds+" seconds")}
${entry("Stored dimensions",r.width_px+" × "+r.height_px+" pixels")}${entry("Encoded frame rate",r.encoded_frame_rate+" fps")}
${entry("Audio stream",r.has_audio==="true"?"Present":"Absent")}${entry("Temporal basis",realTimeStatusLabel(r.temporal_basis))}
${entry("Clock accuracy",realTimeStatusLabel(r.clock_accuracy_status))}${entry("Source role",realTimeStatusLabel(r.source_role_status))}
${entry("Demux check",realTimeStatusLabel(r.demux_status))}${entry("Work identity",r.work_id||"Not assigned in the source index")}
</dl>
${r.notes?`<h3>Source notes</h3><p class="notes">${escape(r.notes)}</p>`:""}
<details><summary>File identity and encoded-stream details</summary><dl class="metadata">
${entry("Repository path",r.file_name)}${entry("Original filename",r.original_filename)}${entry("Size",r.size_bytes+" bytes")}${entry("SHA-256",r.sha256)}${entry("Hub Xet identity",r.hub_xet_hash)}
${entry("Video codec",r.video_codec)}${entry("Pixel format",r.pixel_format)}${entry("Time base",r.time_base)}${entry("Frame count",r.nb_frames)}
</dl></details><p><a href="${source(INPUT_PATHS[0])}">Source metadata</a> · <a href="${source(INPUT_PATHS[2])}">Pairing and timestamp evidence</a> · <a href="#${escape(r.record_id)}">Link to this record</a></p>
</article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Real-time recordings · Time-Lapse Artifacts</title>
<style>
:root{color-scheme:light dark;--page:light-dark(#e8e9e7,#111315);--ink:light-dark(#202326,#f0f1ef);--rule:light-dark(#bfc3c6,#363a3e)}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:28px 20px 70px}h1{font:400 34px/1.2 Georgia,serif}h2{font-size:23px}h3{font-size:16px;margin-bottom:4px}a{color:inherit;text-decoration:underline;text-underline-offset:3px}p,dd,code,a{overflow-wrap:anywhere}code{font-size:13px}.metadata{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px}.metadata div{min-width:0}dt{font-size:13px;opacity:.75}dd{margin:2px 0 0}.notes{white-space:pre-wrap}.relationship{border-left:3px solid var(--rule);padding-left:16px}article{border-top:1px solid var(--rule);padding:20px 0;scroll-margin-top:16px}summary{cursor:pointer;padding:10px 0}:focus-visible{outline:2px solid currentColor;outline-offset:4px}nav ul{padding-left:22px}@media(max-width:600px){.metadata{grid-template-columns:1fr}h1{font-size:29px}}
</style></head><body><main>
<a href="./">← Browse time-lapse recordings</a><h1>Real-time recordings</h1>
<p>${payload.records.length} separately indexed MOV recordings, with their published metadata and candidate time-lapse relationships. Recording mode ${payload.recordingModeBasis === "source_metadata" ? "is read from the pinned source metadata" : "follows the documented collection"}.</p>
<p>Encoded durations describe the media timeline. Candidate links retain their published status; they do not assign a work identity or a calibrated temporal alignment.</p>
<p><a href="data/real-time-recordings.json">Download browser metadata (JSON)</a> · <a href="${source(INPUT_PATHS[0],"resolve")}">Source metadata (CSV)</a> · <a href="${source(INPUT_PATHS[3])}">Field definitions</a></p>
<nav aria-label="Real-time records"><ul>${payload.records.map(r=>`<li><a href="#${escape(r.record_id)}">${escape(realTimeDisplayFilename(r))}</a></li>`).join("")}</ul></nav>
${articles}
<footer><p>Source snapshot: <a href="https://huggingface.co/datasets/${REAL_TIME_REPOSITORY}/tree/${revision}"><code>${revision}</code></a>. Full source values and the metadata/checksum bindings are retained in the JSON download.</p>
<p><a href="https://huggingface.co/datasets/${REAL_TIME_REPOSITORY}">Source dataset</a> · <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a> · <a href="./">Recording browser</a></p></footer>
</main></body></html>\n`;
}

async function main() {
  const read = p => readFileSync(new URL(p,ROOT));
  const recordData = JSON.parse(read("data/records.json"));
  const directory = new URL("data/real-time-source/",ROOT);
  if (process.argv.includes("--sync")) {
    const entries = await Promise.all(INPUT_PATHS.map(async path => {
      const response = await fetch(realTimeSourceUrl(recordData.sourceRevision,path),{signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`Source metadata returned ${response.status}: ${path}`);
      const bytes=Buffer.from(await response.arrayBuffer());return {path,bytes,binding:{sha256:sha256(bytes),sizeBytes:bytes.length}};
    }));
    const manifest={sourceRepository:REAL_TIME_REPOSITORY,sourceRevision:recordData.sourceRevision,inputs:Object.fromEntries(entries.map(e=>[e.path,e.binding]))};
    // Validate every source value and cross-check the checksum coverage before writing.
    buildRealTimeProjection(recordData,{manifest,csv:entries[0].bytes,sums:entries[1].bytes});
    mkdirSync(directory,{recursive:true});
    writeFileSync(new URL("metadata.csv",directory),entries[0].bytes);writeFileSync(new URL("SHA256SUMS",directory),entries[1].bytes);
    writeFileSync(new URL("manifest.json",directory),JSON.stringify(manifest,null,2)+"\n");
  }
  const inputs={manifest:JSON.parse(read("data/real-time-source/manifest.json")),csv:read("data/real-time-source/metadata.csv"),sums:read("data/real-time-source/SHA256SUMS")};
  const projection=buildRealTimeProjection(recordData,inputs);
  const outputs={"data/real-time-recordings.json":JSON.stringify(projection,null,2)+"\n","real-time-recordings.html":buildRealTimePage(projection,recordData)};
  for(const [path,content] of Object.entries(outputs)) {
    if(process.argv.includes("--check")) {if(read(path).toString("utf8")!==content)throw new Error(`Stale real-time projection: ${path}`);}
    else writeFileSync(new URL(path,ROOT),content);
  }
  console.log(`Real-time metadata ${process.argv.includes("--check")?"verified":"generated"}: ${projection.records.length} records; all original source fields retained`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
