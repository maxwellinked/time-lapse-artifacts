import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./parse-csv.mjs";
import { validateSequenceInsertions } from "../assets/sequence-insertions.js";
const REGISTRY_PATH = "Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json";
const BASE_URL = "https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/";
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function require(ok, message) { if (!ok) throw new Error(`Invalid authoritative sequence insertion: ${message}`); }
function safePath(path) {
  require(typeof path === "string" && path.length > 0 && !/[\\\r\n\0:]/.test(path) && path.split("/").every(p=>p && p!=="." && p!==".."), "unsafe source path");return path;
}
async function fetchSource(path, revision) {
  const response = await fetch(BASE_URL + revision + "/" + safePath(path).split("/").map(encodeURIComponent).join("/"), { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  require(response.ok, `source returned HTTP ${response.status}: ${path}`);return Buffer.from(await response.arrayBuffer());
}
function uniqueRows(bytes, name) {
  require(bytes, `missing ${name}`);
  const rows = parseCsv(bytes.toString("utf8")).map(r=>r.values);
  require(new Set(rows.map(r=>r.record_id)).size === rows.length, `duplicate record IDs in ${name}`); return new Map(rows.map(r=>[r.record_id,r]));
}
export async function buildSequenceInsertions(payload, { readSource = fetchSource } = {}) {
  const revision = payload.sourceRevision;
  require(HEX40.test(revision), "full source revision required");
  const registryBytes = await readSource(REGISTRY_PATH, revision);
  if (registryBytes === null) { validateSequenceInsertions(null,payload.records,revision);return null; }
  const registry = JSON.parse(registryBytes.toString("utf8"));
  require(registry.schema_version === 1 && Array.isArray(registry.sequences), "registry schema");
  const metadataBytes = await readSource("metadata.csv",revision);
  const metadata = uniqueRows(metadataBytes,"metadata.csv");
  const sumsBytes = await readSource("SHA256SUMS", revision);require(sumsBytes,"missing SHA256SUMS");
  const sums = new Map();
  for(const line of sumsBytes.toString("utf8").trimEnd().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64}) [ *](.+)$/);require(m && !sums.has(m[2]),"invalid/duplicate SHA256SUMS");sums.set(m[2],m[1]);
  }
  const records = new Map(payload.records.map(r=>[r.recordId,r]));
  require(records.size === payload.records.length,"duplicate projected record IDs");
  const projection={schemaVersion:1,sourceHubRevision:revision,sourceRegistry:{path:REGISTRY_PATH,sha256:digest(registryBytes)},sequences:[]};
  const manifests = new Set();
  for(const binding of registry.sequences) {
    const path = safePath(binding.manifest_path);
    require(!manifests.has(path) && HEX64.test(binding.sha256),"duplicate manifest or invalid binding"); manifests.add(path);
    const bytes = await readSource(path,revision);require(bytes && digest(bytes)===binding.sha256,"manifest hash differs");
    const manifest = JSON.parse(bytes.toString("utf8"));
    require(manifest.schema_version===1 && HEX40.test(manifest.source_hub_revision),"manifest source revision is unbound");
    const predecessor=manifest.predecessor;
    require(predecessor && HEX40.test(predecessor.source_hub_revision) && HEX64.test(predecessor.sha256),"invalid predecessor source binding");
    safePath(predecessor.path);
    const oldBytes=await readSource(predecessor.path,predecessor.source_hub_revision);
    const currentOldBytes=await readSource(predecessor.path,revision);
    require(oldBytes && currentOldBytes && digest(oldBytes)===predecessor.sha256 && digest(currentOldBytes)===predecessor.sha256,"predecessor hash differs or historical receipt changed");
    const oldRows=[...uniqueRows(oldBytes,"predecessor").values()].filter(r=>r.fragment_set_label===manifest.fragment_set_label && r.object_role==="canonical_fragment").sort((a,b)=>Number(a.sequence_position)-Number(b.sequence_position));
    require(oldRows.length>0,"missing predecessor group");
    require(Array.isArray(manifest.members) && Array.isArray(manifest.additions) && manifest.additions.length>0 && new Set(manifest.additions).size===manifest.additions.length,"invalid declared additions");
    const oldIds = new Set(oldRows.map(r=>r.record_id)), memberIds=new Set();
    require(manifest.members.length===oldRows.length+manifest.additions.length,"member count differs");
    const sourceMetadata=uniqueRows(await readSource("metadata.csv",manifest.source_hub_revision),"manifest input metadata.csv");
    for(const [index, member] of manifest.members.entries()) {
      const id=member.record_id, row=metadata.get(id), input=sourceMetadata.get(id), record=records.get(id);
      require(!memberIds.has(id) && row && input && record,"duplicate, unknown or missing member");memberIds.add(id);
      require(member.sequence_position===index+1,"noncontiguous sequence positions");
      require(HEX64.test(member.sha256) && HEX64.test(member.hub_xet_hash) && Number.isSafeInteger(member.size_bytes) && member.size_bytes>0,"unbound content identity");
      require(JSON.stringify(row)===JSON.stringify(input),"member changed since manifest input source revision");
      require(row.file_name===member.file_path && row.hub_xet_hash===member.hub_xet_hash && Number(row.size_bytes)===member.size_bytes && sums.get(member.file_path)===member.sha256,"member source identity differs");
      const url=BASE_URL+revision+"/"+safePath(member.file_path).split("/").map(encodeURIComponent).join("/");
      require(record.sourceUrl===url && record.filename===member.file_path.split("/").at(-1) && record.integrityReference===member.hub_xet_hash,"projected member identity or revision differs");
      if (!oldIds.has(id)) require(manifest.additions.includes(id),"undeclared addition");
    }
    require(manifest.additions.every(id=>memberIds.has(id) && !oldIds.has(id)),"addition is missing or historical");
    const retained=manifest.members.filter(m=>oldIds.has(m.record_id));
    for(const [i,old] of oldRows.entries()) {
      const member=retained[i];require(member && member.record_id===old.record_id,"predecessor member order changed");
      require(member.file_path===old.file_path && member.sha256===old.sha256 && member.hub_xet_hash===old.hub_xet_hash && member.size_bytes===Number(old.size_bytes),"historical member identity changed");
    }
    projection.sequences.push({fragmentSetLabel:manifest.fragment_set_label,sourceManifest:{path,sha256:digest(bytes)},recordIds:manifest.members.map(m=>m.record_id),evidence:manifest.evidence,sequenceCompleteness:manifest.sequence_completeness});
  }
  return validateSequenceInsertions(projection,payload.records,revision);
}
function option(name) { const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1]; }
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const recordsPath=option("--records") ?? fileURLToPath(new URL("../data/records.json",import.meta.url));
  const payload=JSON.parse(readFileSync(recordsPath));
  const sourceRoot=option("--source-root");
  const readSource=sourceRoot ? async(path,revision)=>{
    safePath(path);require(HEX40.test(revision),"invalid Git revision");
    const git=process.env.GIT_EXECUTABLE ?? "git";
    const exists=execFileSync(git,["ls-tree",revision,"--",path],{cwd:sourceRoot,encoding:"utf8"});
    return exists.trim()?execFileSync(git,["show",`${revision}:${path}`],{cwd:sourceRoot,maxBuffer:32*1024*1024}):null;
  }:fetchSource;
  const projection=await buildSequenceInsertions(payload,{readSource});
  const output=option("--output") ?? fileURLToPath(new URL("../data/sequence-insertions.json",import.meta.url));
  if(projection) {
    const bytes=JSON.stringify(projection,null,2)+"\n";
    if(process.argv.includes("--check")) require(readFileSync(output,"utf8")===bytes,"stale derived projection");
    else writeFileSync(output,bytes);
    console.log(JSON.stringify({sourceHubRevision:payload.sourceRevision,sequences:projection.sequences.length,output}));
  } else console.log(JSON.stringify({sourceHubRevision:payload.sourceRevision,sequences:0,status:"historical-source-without-registry"}));
}
