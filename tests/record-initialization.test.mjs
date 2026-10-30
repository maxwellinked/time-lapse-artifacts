import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { deriveRecordingSequences, sortRecordsForDisplay } from "../assets/record-sequences.js";
import { loadSequenceInsertions } from "../assets/sequence-insertions.js";
const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const source = [
  app.slice(app.indexOf("function recordMatches("),app.indexOf("function renderRecords()")),
  app.slice(app.indexOf("function openRecord(record"),app.indexOf("function resetDialogVideo()")),
  app.slice(app.indexOf("function navigateDialog("),app.indexOf("// Cleanup on page unload")),
  app.slice(app.indexOf("async function initialize()"),app.indexOf('elements.retryData.addEventListener("click", initialize)')),
].join("\n");
const label = "2026-10-25.0938.BallpointPen.Ink.Paper.9x12";
const ids = ["tla-3629fd6f65c8e3fd","tla-f4860d81610d06e2","tla-ab38992860ebf086","tla-f5575d594e459bfc","tla-66500ae259f48f35","tla-ee5ef18a738d9716","tla-bc90bb2c30a23b73","tla-4441345c1d3d1392","tla-268196248f820e42","tla-0a7b1ed861f10d7d","tla-f3f1ebaf9ef0a80c"];
const ordered = ["01","02","03","03a","03b","04","05","06","07","08","09"].map((suffix,i)=>({recordId:ids[i],filename:`${label}.Rec${suffix}.mp4`,rowIndex:[1270,1271,1272,1303,1304,1273,1274,1275,1276,1277,1278][i],date:"2026-10-25",time:"09:38",tool:"BallpointPen",dimensions:"9x12"}));
const records = [...ordered].sort((a,b)=>a.rowIndex-b.rowIndex);
const revision = "a".repeat(40), nextRevision = "d".repeat(40);
function projection(pin=revision) {return {schemaVersion:1,sourceHubRevision:pin,sourceRegistry:{path:"Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json",sha256:"b".repeat(64)},sequences:[{fragmentSetLabel:label,sourceManifest:{path:"Standard_Time_Lapses/Provenance/Sequence_Insertions/2026-10-29-F/sequence.json",sha256:"c".repeat(64)},recordIds:ids,evidence:{membership:"owner-confirmed",order:"visual-inference-with-device-metadata-corroboration",gapless_capture:"not-established"},sequenceCompleteness:"unknown"}]};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness({loadRecords=async()=>({records,sourceRevision:revision}),fetchProjection=async()=>new Response(JSON.stringify(projection())),loadPhotos=async()=>({})}={}) {
  const events=new Map(),form={order:"desc"},calls={rendered:[],opened:[]};
  const node=()=>({dataset:{},hidden:true,addEventListener(name,handler){this.events??=new Map();this.events.set(name,handler);},setAttribute(){},removeAttribute(){},replaceChildren(){}});
  const elements=Object.fromEntries(["retryData","dataError","dataErrorMessage","resultCount","retryPhotoFilter","grid","showMore","recordCount","dateCoverage","previousRecord","nextRecord","openFeatured"].map(name=>[name,node()]));
  elements.filters={...node(),elements:{photograph:{value:""},search:{}}};
  elements.dialog={...node(),open:false,showModal(){this.open=true;},close(){this.open=false;this.events.get("close")?.();}};
  const state={records:[],filtered:[],sourceRevision:null,recordData:null,sequenceDetails:new Map(),ready:false,loadGeneration:0};
  const location=new URL("https://example.test/archive/");
  const context={state,elements,location,filterGeneration:0,referenceGeneration:0,referenceLookupPromise:null,selectedFrontLookupPromise:null,referenceEvidencePromise:null,realTimeLookupPromise:null,PAGE_SIZE:18,DATA_URL:"records",loadRecords,
    loadSequenceInsertions:(url,rows,pin)=>loadSequenceInsertions(url,rows,pin,{fetchImpl:fetchProjection}),deriveRecordingSequences,sortRecordsForDisplay,
    RecordsDataError:class extends Error{},console:{error(){}},navigator:{onLine:true},URLSearchParams,
    FormData:class{get(name){return name==="photograph"?elements.filters.elements.photograph.value:form[name];}},loadSelectedFrontLookup:loadPhotos,getSelectedFrontForRecord:()=>true,
    renderRecords(){calls.rendered.push(state.filtered.map(r=>r.recordId));},renderDialog(record){state.activeRecord=record;calls.opened.push(record.recordId);},populateFilters(){},renderFeatured(){},clearReference(){},resetDialogVideo(){},relatedRecordings:{clear(){}},
    window:{addEventListener:(name,fn)=>events.set(name,fn),setTimeout:fn=>fn()},history:{replaceState(_s,_t,url){location.href=new URL(url,location).href;}}};
  const api=runInNewContext(source+"\n({initialize,applyFilters,openHashRecord,openRecord,navigateDialog})",context);
  return {api,state,elements,calls,form,context,hash(id=ids[3]){location.hash=`record=${id}`;events.get("hashchange")();},filter(){return elements.filters.events.get("input")();},page(){elements.showMore.events.get("click")();}};
}
for(const [name,response] of [["missing",()=>new Response("",{status:404})],["malformed",()=>new Response("{}")]]) {
  test(`${name} projection leaves filter, hash, dialog and paging entry points unavailable`,async()=>{
    const ui=harness({fetchProjection:async()=>response()});await ui.api.initialize();
    await ui.filter();ui.hash();ui.api.openRecord(records[0]);ui.page();
    assert.equal(ui.elements.dataError.hidden,false);
    assert.equal(ui.state.records.length,0);assert.equal(ui.state.sourceRevision,null);
    assert.equal(ui.calls.rendered.length,0);assert.equal(ui.calls.opened.length,0);
  });
}
test("pending projection cannot publish records or service filter/hash/dialog events",async()=>{
  const pending=deferred();const ui=harness({fetchProjection:()=>pending.promise});const init=ui.api.initialize();
  await new Promise(setImmediate);await ui.filter();ui.hash();ui.api.openRecord(records[0]);ui.page();
  const before={records:ui.state.records.length,pin:ui.state.sourceRevision,renders:ui.calls.rendered.length,opens:ui.calls.opened.length};
  pending.resolve(new Response("",{status:404}));await init;
  assert.deepEqual(before,{records:0,pin:null,renders:0,opens:0});
});
test("validated initialization and real filter/hash handlers retain the eleven-member order",async()=>{
  const ui=harness();await ui.api.initialize();
  assert.equal(ui.state.ready,true);assert.deepEqual([...ui.state.filtered].map(r=>r.recordId),ids);
  for(const order of ["asc","desc"]){ui.form.order=order;await ui.filter();assert.deepEqual([...ui.state.filtered].map(r=>r.recordId),ids);}
  ui.hash();assert.deepEqual(ui.calls.opened,[ids[3]]);
  ui.form.search="Rec03";await ui.filter();assert.deepEqual([...ui.state.filtered].map(r=>r.recordId),ids.slice(2,5));
});
for(const late of ["success","failure"]) {
  test(`retry ignores obsolete initialization ${late} after a newer successful load`,async()=>{
    const old=deferred();let requests=0,loads=0;
    const ui=harness({loadRecords:async()=>({records:structuredClone(records),sourceRevision:++loads===1?revision:nextRevision}),fetchProjection:async()=>++requests===1?old.promise:new Response(JSON.stringify(projection(nextRevision)))});
    const first=ui.api.initialize();await new Promise(setImmediate);await ui.api.initialize();
    const details=ui.state.sequenceDetails,renderCount=ui.calls.rendered.length;
    if(late==="success")old.resolve(new Response(JSON.stringify(projection())));else old.reject(new Error("old request failed"));
    await first;
    assert.equal(ui.state.sourceRevision,nextRevision);assert.equal(ui.state.sequenceDetails,details);
    assert.equal(ui.elements.dataError.hidden,true);assert.equal(ui.calls.rendered.length,renderCount);
    assert.equal(ui.elements.retryData.disabled,false);
  });
}

for(const late of ["success","failure"]) {
  test(`retry invalidates old photograph-filter ${late} while the replacement projection is pending`,async()=>{
    const photos=deferred(), replacement=deferred();let loads=0;
    const ui=harness({
      loadRecords:async()=>({records:structuredClone(records),sourceRevision:++loads===1?revision:nextRevision}),
      fetchProjection:async()=>loads===1?new Response(JSON.stringify(projection())):replacement.promise,
      loadPhotos:()=>photos.promise,
    });
    await ui.api.initialize();ui.elements.filters.elements.photograph.value="with";const oldFilter=ui.filter();
    ui.elements.filters.elements.photograph.value="";const retry=ui.api.initialize();await new Promise(setImmediate);
    const before=ui.calls.rendered.length;
    if(late==="success")photos.resolve({});else photos.reject(new Error("old lookup failed"));await oldFilter;
    const pending={renders:ui.calls.rendered.length,records:ui.state.records.length,ready:ui.state.ready};
    replacement.resolve(new Response(JSON.stringify(projection(nextRevision))));await retry;
    assert.deepEqual(pending,{renders:before,records:0,ready:false});
    assert.equal(ui.elements.filters.elements.photograph.value,"");
    assert.deepEqual([...ui.state.filtered].map(r=>r.recordId),ids);assert.equal(ui.state.sourceRevision,nextRevision);
  });
}
test("an obsolete failure cannot display errors or unlock retry during a replacement load",async()=>{
  const old=deferred(),replacement=deferred();let loads=0;
  const ui=harness({loadRecords:async()=>({records,sourceRevision:++loads===1?revision:nextRevision}),fetchProjection:async()=>loads===1?old.promise:replacement.promise});
  const first=ui.api.initialize();await new Promise(setImmediate);
  const retry=ui.api.initialize();await new Promise(setImmediate);
  old.reject(new Error("obsolete failure"));await first;
  const pending={errorHidden:ui.elements.dataError.hidden,retryDisabled:ui.elements.retryData.disabled,records:ui.state.records.length};
  replacement.resolve(new Response(JSON.stringify(projection(nextRevision))));await retry;
  assert.deepEqual(pending,{errorHidden:true,retryDisabled:true,records:0});
  assert.equal(ui.state.sourceRevision,nextRevision);assert.equal(ui.state.ready,true);
});
