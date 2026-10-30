import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const current = "a".repeat(40), source = "b".repeat(40), predecessorRevision = "c".repeat(40);
const registryPath = "Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json";
const manifestPath = "Standard_Time_Lapses/Provenance/Sequence_Insertions/2026-10-29-F/sequence.json";
const predecessorPath = "Standard_Time_Lapses/Provenance/2026-10-29/fragment_sequence_relationships.csv";
const label = "2026-10-25.0938.BallpointPen.Ink.Paper.9x12";
function fixture(change = () => {}) {
  const suffixes = ["01","02","03","03a","03b","04","05","06","07","08","09"];
  const members = suffixes.map((part,i)=>({record_id:`tla-${(i+1).toString(16).padStart(16,"0")}`,file_path:`Standard_Time_Lapses/${label}.Rec${part}.mp4`,sha256:(i+1).toString(16).padStart(64,"0"),hub_xet_hash:(i+20).toString(16).padStart(64,"0"),size_bytes:i+100,sequence_position:i+1}));
  const old = members.filter(m=>!/[ab]\.mp4$/.test(m.file_path));
  const csv = (fields,rows) => fields.join(",")+"\n"+rows.map(r=>fields.map(k=>r[k]??"").join(",")).join("\n")+"\n";
  const predecessor = csv(["fragment_set_label","object_role","record_id","file_path","sha256","hub_xet_hash","size_bytes","sequence_position"],old.map((m,i)=>({...m,fragment_set_label:label,object_role:"canonical_fragment",sequence_position:i+1})));
  const manifest = {schema_version:1,fragment_set_label:label,source_hub_revision:source,predecessor:{path:predecessorPath,sha256:digest(predecessor),source_hub_revision:predecessorRevision},additions:members.slice(3,5).map(m=>m.record_id),members,sequence_completeness:"unknown",evidence:{membership:"owner-confirmed",order:"visual-inference-with-device-metadata-corroboration",gapless_capture:"not-established"}};
  const state = {manifest,predecessor,members}; change(state);
  const metadata = csv(["record_id","file_name","hub_xet_hash","size_bytes"],members.map(m=>({...m,file_name:m.file_path})));
  const sourceFiles = { [manifestPath]:JSON.stringify(manifest), [predecessorPath]:state.predecessor, "metadata.csv":metadata, "SHA256SUMS":members.map(m=>`${m.sha256}  ${m.file_path}`).join("\n")+"\n" };
  sourceFiles[registryPath]=JSON.stringify({schema_version:1,sequences:[{manifest_path:manifestPath,sha256:digest(sourceFiles[manifestPath])}]});
  const records = members.map((m,i)=>({recordId:m.record_id,filename:m.file_path.split("/").at(-1),integrityReference:m.hub_xet_hash,sourceUrl:`https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${current}/${m.file_path}`}));
  return {state,sourceFiles, payload:{sourceRevision:current,records}, readSource:async(path,revision)=>{assert.ok([current,source,predecessorRevision].includes(revision)); if (!(path in sourceFiles)) return null; return Buffer.from(sourceFiles[path]);}};
}
async function builder() {
  const module = await import("../tools/sync-sequence-insertions.mjs").catch(e=>e.code==="ERR_MODULE_NOT_FOUND"?{}:Promise.reject(e));
  assert.equal(typeof module.buildSequenceInsertions,"function","authoritative projection builder must exist"); return module.buildSequenceInsertions;
}
test("builds exact same-revision order projection bound to source registry and predecessor",async()=>{
  const build=await builder(), f=fixture();const p=await build(f.payload,{readSource:f.readSource});
  assert.equal(p.sourceHubRevision,current);assert.equal(p.sourceRegistry.sha256,digest(f.sourceFiles[registryPath]));
  assert.equal(p.sequences[0].sourceManifest.sha256,digest(f.sourceFiles[manifestPath]));
  assert.deepEqual(p.sequences[0].recordIds,f.state.members.map(m=>m.record_id));
});
function singleInsertionFixture() {
  return fixture(s => {
    s.members.splice(4, 1);
    s.members.forEach((member, index) => { member.sequence_position = index + 1; });
    s.manifest.additions = [s.members[3].record_id];
  });
}
test("projects one declared Rec03a addition while retaining all predecessor identities and order", async () => {
  const build = await builder(), f = singleInsertionFixture();
  const projection = await build(f.payload, {readSource: f.readSource});
  assert.deepEqual(projection.sequences[0].recordIds, [
    "tla-0000000000000001", "tla-0000000000000002", "tla-0000000000000003",
    "tla-0000000000000004", "tla-0000000000000006", "tla-0000000000000007",
    "tla-0000000000000008", "tla-0000000000000009", "tla-000000000000000a",
    "tla-000000000000000b",
  ]);
});
test("each registered group verifies its own independent manifest input revision", async () => {
  const build = await builder(), f = fixture(), g = singleInsertionFixture();
  const secondSource = "d".repeat(40), secondPredecessor = "e".repeat(40);
  const secondLabel = "2026-10-24.1017.BallpointPen.Ink.Paper.9x12";
  const secondManifestPath = manifestPath.replace("2026-10-29-F", "2026-10-30-G");
  const secondPredecessorPath = predecessorPath.replace("2026-10-29", "2026-10-30");
  const translate = value => value.replaceAll(label, secondLabel).replaceAll(
    /tla-([a-f0-9]{16})/g, (_, id) => `tla-${(parseInt(id,16)+256).toString(16).padStart(16,"0")}`)
    // The second group has independent content identities as well as record IDs.
    .replaceAll(/\b0{40}[a-f0-9]{24}\b/g, hash =>
      (BigInt("0x" + hash) + 256n).toString(16).padStart(64,"0"));
  const secondManifest = JSON.parse(translate(JSON.stringify(g.state.manifest)));
  secondManifest.source_hub_revision = secondSource;
  secondManifest.predecessor.path = secondPredecessorPath;
  secondManifest.predecessor.source_hub_revision = secondPredecessor;
  const secondPacket = translate(g.sourceFiles[predecessorPath]);
  secondManifest.predecessor.sha256 = digest(secondPacket);
  const secondMetadata = translate(g.sourceFiles["metadata.csv"]);
  const combinedMetadata = f.sourceFiles["metadata.csv"] + secondMetadata.split("\n").slice(1).join("\n");
  const files = {
    ...f.sourceFiles,
    [secondManifestPath]: JSON.stringify(secondManifest),
    [secondPredecessorPath]: secondPacket,
    "metadata.csv": combinedMetadata,
    "SHA256SUMS": f.sourceFiles.SHA256SUMS + translate(g.sourceFiles.SHA256SUMS),
  };
  files[registryPath] = JSON.stringify({schema_version:1,sequences:[
    {manifest_path:manifestPath,sha256:digest(files[manifestPath])},
    {manifest_path:secondManifestPath,sha256:digest(files[secondManifestPath])},
  ]});
  const payload = {sourceRevision:current,records:[...f.payload.records,
    ...g.payload.records.map(record => JSON.parse(translate(JSON.stringify(record))))]};
  const readSource = async(path, pin) => {
    if (path === "metadata.csv" && pin === source) return Buffer.from(f.sourceFiles[path]);
    if (path === "metadata.csv" && pin === secondSource) return Buffer.from(combinedMetadata);
    if (pin === current || (pin === predecessorRevision && path === predecessorPath) ||
        (pin === secondPredecessor && path === secondPredecessorPath)) {
      return path in files ? Buffer.from(files[path]) : null;
    }
    throw new Error(`Unexpected independently pinned input ${pin}:${path}`);
  };
  const projection = await build(payload, {readSource});
  assert.equal(projection.sequences.length, 2);
  assert.equal(projection.sequences[0].recordIds.length, 11);
  assert.equal(projection.sequences[1].recordIds.length, 10);
  assert.equal(projection.sequences[1].recordIds[3], "tla-0000000000000104");
  for (const changedPin of [source, secondSource]) {
    await assert.rejects(build(payload, {readSource: async(path, pin) => {
      const bytes = await readSource(path, pin);
      const targetId = changedPin === source ? "tla-0000000000000001" : "tla-0000000000000101";
      return path === "metadata.csv" && pin === changedPin
        ? Buffer.from(bytes.toString().split("\n").map(line => line.startsWith(targetId + ",")
          ? line.replace(/,100$/, ",999") : line).join("\n")) : bytes;
    }}), /input source revision/);
  }
});
test("declared additions must remain positive, unique, and absent from predecessor", async () => {
  const build = await builder();
  for (const change of [s => {s.manifest.additions=[];},
    s => {s.manifest.additions=[s.members[3].record_id,s.members[3].record_id];},
    s => {s.manifest.additions=[s.members[0].record_id,s.members[4].record_id];}]) {
    const f = fixture(change);
    await assert.rejects(build(f.payload, {readSource:f.readSource}), /addition|member count/);
  }
});
test("refuses stale or missing source bindings, malformed order, changed predecessor and remote identity",async()=>{
  const build=await builder();
  for(const change of [s=>s.manifest.source_hub_revision=null,s=>s.manifest.predecessor.sha256="f".repeat(64),s=>s.manifest.members[5].sequence_position=5,s=>s.manifest.members.reverse(),s=>s.manifest.additions.pop(),s=>s.manifest.evidence.order="owner-confirmed",s=>s.manifest.members[0].record_id="tla-ffffffffffffffff",s=>s.manifest.members[0].hub_xet_hash=null]) {
    const f=fixture(change);await assert.rejects(build(f.payload,{readSource:f.readSource}));
  }
  for(const missing of [registryPath,manifestPath,predecessorPath]) {const f=fixture();delete f.sourceFiles[missing];await assert.rejects(build(f.payload,{readSource:f.readSource}));}
  const f=fixture();f.sourceFiles[manifestPath]+=" ";await assert.rejects(build(f.payload,{readSource:f.readSource}),/hash/);
});


test("does not accept a changed metadata input pin, source URL pin, checksum, or predecessor identity", async () => {
  const build = await builder();
  const stale = fixture();
  await assert.rejects(build(stale.payload, {readSource: async (path, pin) => {
    const bytes = await stale.readSource(path,pin);
    return path === "metadata.csv" && pin === source
      ? Buffer.from(bytes.toString().replace(",100\n",",999\n")) : bytes;
  }}), /input source revision/);
  const url = fixture(); url.payload.records[0].sourceUrl = url.payload.records[0].sourceUrl.replace(current,source);
  await assert.rejects(build(url.payload,{readSource:url.readSource}),/revision/);
  const sums = fixture(); sums.sourceFiles["SHA256SUMS"] = sums.sourceFiles["SHA256SUMS"].replace(sums.state.members[0].sha256,"f".repeat(64));
  await assert.rejects(build(sums.payload,{readSource:sums.readSource}),/source identity/);
  const old = fixture(); const read = old.readSource;
  await assert.rejects(build(old.payload,{readSource: async(path,pin) => {
    const bytes = await read(path,pin);
    return path === predecessorPath && pin === current ? Buffer.concat([bytes,Buffer.from(" ")]) : bytes;
  }}),/historical receipt/);
});
