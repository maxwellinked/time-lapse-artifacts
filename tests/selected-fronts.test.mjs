import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {runInNewContext} from "node:vm";
import test from "node:test";
import {buildSelectedFrontIndex, getSelectedFrontForRecord, getSelectedFrontForWork, loadSelectedFrontIndex} from "../assets/selected-fronts.js";
import {buildDrawingArchive} from "../assets/drawing-archive-model.js";
import {attachPhotographDownloads} from "../assets/photograph-downloads.js";
import {validateRegistrySelections,validateRegistryDownloads} from "../tools/validate-selected-fronts.mjs";
import {getDisplayReference,referenceExclusion,describeReferenceLink} from "../assets/reference-policy.js";
import {getPhotographDisplayRotation} from "../assets/photograph-orientation.js";
import {deriveRecordingSequences,sortRecordsForDisplay} from "../assets/record-sequences.js";
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read("../data/records.json"), refs=read("../data/physical-references.json");
const insertionPath=new URL("../data/sequence-insertions.json",import.meta.url);
const insertions=existsSync(insertionPath)?JSON.parse(readFileSync(insertionPath)):null;
const projection=read("../data/selected-fronts.json");
const index=buildSelectedFrontIndex(projection,data,refs);
const app=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const gallery=readFileSync(new URL("../assets/drawing-archive.js",import.meta.url),"utf8");
const clone=structuredClone;

test("435 selected fronts agree with all gallery identities and 1256 recording joins",()=>{
 const before=JSON.stringify(refs);
 const works=buildDrawingArchive(data,refs,read("../reference-previews/manifest.json"));
 assert.equal(works.length,435); assert.equal(Object.keys(index.byRecord).length,1256);
 assert.equal(index.unselectedWorkIds.length,0);
 assert.deepEqual(data.records.filter(r=>getSelectedFrontForRecord(index,r.recordId)===null).map(r=>r.recordId).sort(),
   data.records.filter(r=>refs.records[r.recordId].selectionStatus==="missing_work_link").map(r=>r.recordId).sort());
 for(const work of works) for(const record of work.records) {
   assert.equal(getSelectedFrontForRecord(index,record.recordId),getSelectedFrontForWork(index,work.workId));
 }
 assert.equal(getSelectedFrontForRecord(index,"unlinked-pre-standard"),null);
 assert.equal(JSON.stringify(refs),before);
});
test("registry projection rejects changed source/display choices and mixed download snapshots",()=>{
 const registry=read("../data/source-photo-selections.json");
 assert.doesNotThrow(()=>validateRegistrySelections(projection,registry));
 for(const mutate of [p=>p.selections[0].source_photograph_sha256="0".repeat(64),p=>p.selections[0].display.output_display_sha256="0".repeat(64)]) {
  const candidate=clone(projection);mutate(candidate);assert.throws(()=>validateRegistrySelections(candidate,registry));
 }
 const goodDownloads=read("../data/photograph-downloads.json");
 for (const mutate of [d=>d.rows[0].sha256="0".repeat(64),d=>d.rows[0].path+="wrong",d=>d.rows[0].media_revision="0".repeat(40),d=>d.rows[0].width_px=1,d=>d.rows[0].resolution_class="limited_resolution_jpeg"]) {
  const candidate=clone(goodDownloads);mutate(candidate);
  if (JSON.stringify(candidate)===JSON.stringify(goodDownloads)) candidate.rows[0].resolution_class="native_resolution_jpeg";
  assert.throws(()=>validateRegistryDownloads(candidate,registry));
  assert.throws(()=>attachPhotographDownloads(index,candidate),/registry/);
 }
 const downloads=read("../data/photograph-downloads.json");downloads.selection_registry.sha256="0".repeat(64);
 assert.throws(()=>attachPhotographDownloads(index,downloads),/registry/);
});
test("current selections require an exact authoritative source registry binding",()=>{
 for(const mutate of [p=>delete p.selection_registry,p=>p.selection_registry={repository:"wrong",revision:"a".repeat(40),path:"wrong",sha256:"0".repeat(64)}]) {
  const p=clone(projection);mutate(p);assert.throws(()=>buildSelectedFrontIndex(p,data,refs),/registry/);
 }
});
test("wrong work-link hash, duplicate selection, missing output hash and wrong work are rejected",()=>{
 for(const mutate of [p=>p.recording_links.sha256="0".repeat(64),p=>p.selections[1]=p.selections[0],
  p=>p.selections[0].display.output_display_sha256=null,p=>p.selections[0].work_id="tlaw-0000000000000000"]) {
  const p=clone(projection);mutate(p);assert.throws(()=>buildSelectedFrontIndex(p,data,refs));
 }
});
test("loader rejects any unbound projection bytes before exposing selected fronts",async()=>{
 const bytes=readFileSync(new URL("../data/selected-fronts.json",import.meta.url));
 const downloads=readFileSync(new URL('../data/photograph-downloads.json',import.meta.url));
 const requests=[];
 const ok=await loadSelectedFrontIndex(data,refs,async path=>{
  requests.push(path);return new Response(path.startsWith('data/selected-fronts.json?')?bytes:downloads);
 },webcrypto);
 assert.equal(Object.keys(ok.byWork).length,435);
 const newWorks=['tlaw-7a19b1273991da19','tlaw-a826906a465003c2','tlaw-50afa6b8af39342d',
  'tlaw-8e64b069e2eff99d','tlaw-f857d7dc1b634939'];
 for(const workId of newWorks) {
  const sourceDownloads=JSON.parse(downloads);
  const sourceRow=sourceDownloads.rows.find(row=>row.work_id===workId);
  const expectedRevision=sourceRow.media_revision ?? sourceDownloads.media_revision;
  assert.ok(ok.byWork[workId].downloadUrl.includes(`/resolve/${expectedRevision}/`));
  assert.equal(ok.byWork[workId].downloadLabel,'Download full-resolution JPEG');
 }
 assert.ok(requests.every(path=>/\.json\?v=[a-f0-9]{64}$/.test(path)));
 await assert.rejects(loadSelectedFrontIndex(data,refs,async()=>new Response(Buffer.concat([bytes,Buffer.from(" ")])),webcrypto),/hash mismatch/);
});
test("creator-confirmed July 25 stages share one surviving work and selected display",()=>{
 const first=index.byRecord['tla-109ffe803a4ae0b0'], second=index.byRecord['tla-933e757350798d34'];
 assert.equal(first,second);assert.equal(first.workId,'tlaw-858a03eb138fbf47');
 assert.equal(index.byWork['tlaw-b03bbfba8babbf3d'],undefined);
 assert.equal(projection.work_identity_correction.superseded_work_id,'tlaw-b03bbfba8babbf3d');
 assert.equal(refs.workIdentityCorrection.affected_record_id,'tla-933e757350798d34');
});
class Element {
 constructor(tag="div"){this.tag=tag;this.children=[];this.textContent="";this.hidden=true;this.classList=new Set();}
 append(...kids){for(const kid of kids){kid.parent=this;this.children.push(kid);}}
 replaceChildren(...kids){this.children=[];this.append(...kids);}
 querySelector(tag){return this.children.find(x=>x.tag===tag)??null;}
 remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 removeAttribute(key){delete this[key];}addEventListener(){}setAttribute(){}
}
function renderer(){
 const elements=Object.fromEntries(["referenceStage","referenceStatus","referenceRole","referenceFull","referenceRepresentation",
 "referenceDetails","referenceWork","referenceEvidence","additionalReferences","referenceManifest","pairingClarification"].map(k=>[k,new Element()]));
 const state={sourceRevision:data.sourceRevision,activeRecord:null};
 const roles=app.slice(app.indexOf("function referenceRole("),app.indexOf("async function loadReferenceEvidence("));
 const body=app.slice(app.indexOf("function clearReference("),app.indexOf("function renderDialog("));
 const show=runInNewContext(`${roles}\n${body}\nrenderReference`,{elements,state,referenceGeneration:0,getDisplayReference,referenceExclusion,describeReferenceLink,
 getPhotographDisplayRotation,getSelectedFrontForRecord,loadSelectedFrontLookup:async()=>index,loadReferenceLookup:async()=>refs,
 loadReferenceEvidence:async()=>null,document:{createElement:tag=>new Element(tag)}});
 return{elements,state,show};
}
const changed=["tlaw-27d91c3c3ca5d9e3","tlaw-a77d16972149f232","tlaw-3c632c55f324b287","tlaw-ed372076fbc9d7c6","tlaw-7117a0d0cc1e0d34","tlaw-f606aefe171664b6"];
test("all four corrected and two replaced fronts render without legacy rotation; historical source rotation remains",async()=>{
 const ui=renderer();
 for(const workId of [...changed,projection.selections[0].work_id]) {
  const recordId=Object.keys(index.byRecord).find(id=>index.byRecord[id].workId===workId);
  ui.state.activeRecord={recordId};await ui.show({recordId});
  const selected=getSelectedFrontForRecord(index,recordId);
  const image=ui.elements.referenceStage.querySelector("img");
  assert.equal(image.src,selected.displayUrl);assert.equal(ui.elements.referenceFull.href,selected.displayUrl);
  assert.equal(image.classList.has("owner-rotation-clockwise"),false);
 }
 const legacy=Object.values(refs.records).map(getDisplayReference).filter(Boolean);
 assert.equal(new Set(legacy.filter(p=>getPhotographDisplayRotation(p)===90).map(p=>p.work_id)).size,4);
 assert.ok(gallery.includes('!work.selectedFront && getPhotographDisplayRotation(work.photograph) === 90'));
});
test("actual photograph filter uses the common map for all 1256 Standard records",async()=>{
 const state={ready:true,records:data.records,sourceRevision:data.sourceRevision,sequenceDetails:deriveRecordingSequences(data.records,insertions,data.sourceRevision)};
 const elements={filters:{elements:{photograph:{value:"with"}}},grid:{setAttribute(){},removeAttribute(){}},showMore:{},resultCount:{},retryPhotoFilter:{}};
 const source=app.slice(app.indexOf("function recordMatches("),app.indexOf("function renderRecords("));
 await runInNewContext(`${source}\napplyFilters()`,{state,elements,PAGE_SIZE:18,filterGeneration:0,
  FormData:class{get(k){return k==="photograph"?"with":"";}},loadSelectedFrontLookup:async()=>index,getSelectedFrontForRecord,sortRecordsForDisplay,renderRecords(){}});
 assert.equal(state.filtered.length,1256);
});
