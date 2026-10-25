'use strict';
// Pure saved-location binding checks. No I/O, evaluation, fetching or navigation.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SavedLocation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const SCHEMA='tla-inspection-location/v1',MAX_BYTES=65536;
 const TIME_SCOPE='encoded presentation time, not physical drawing time';
 const ROTATION_SCOPE='selected-frame viewport only; no source-orientation assertion';
 const REQUIRED=['source_repository','source_revision','work_id','record_id','source_sha256','pts','time_base','encoded_seconds','browser_seek_seconds','png_sha256','source_url','time_scope','presentation_rotation_ccw_degrees','presentation_rotation_scope'];
 const ALLOWED=new Set([...REQUIRED,'schema']);
 function demand(condition,message){if(!condition)throw new Error(message);}
 function own(value,key){return Object.prototype.hasOwnProperty.call(value,key);}
 function resolveSavedLocation(value,manifest){
  demand(value!==null&&typeof value==='object'&&!Array.isArray(value),'Choose a saved-location JSON object.');
  demand(REQUIRED.every(k=>own(value,k)),'The saved location is incomplete: required information is missing.');
  demand(Object.keys(value).every(k=>ALLOWED.has(k)),'The saved location contains an unsupported field.');
  demand(!own(value,'schema')||value.schema===SCHEMA,'This saved-location version is not supported.');
  demand(manifest&&Array.isArray(manifest.cases),'The loaded inspection manifest is unavailable.');
  demand(typeof value.source_repository==='string'&&value.source_repository===manifest.source_repository,'The saved repository does not match this prototype.');
  demand(typeof value.source_revision==='string'&&/^[0-9a-f]{40}$/.test(value.source_revision)&&value.source_revision===manifest.source_revision,'The saved source revision does not match this prototype.');
  demand(typeof value.record_id==='string','The saved recording identity is invalid.');
  const records=[];
  manifest.cases.forEach((c,caseIndex)=>c.records.forEach((record,recordIndex)=>{
   if(record.record_id===value.record_id)records.push({c,record,caseIndex,recordIndex});
  }));
  demand(records.length===1,'No unique recording matches this saved location in the loaded prototype.');
  const {c,record,caseIndex,recordIndex}=records[0];
  demand(typeof value.work_id==='string'&&value.work_id===c.work_id&&value.work_id===record.work_id,'The saved work identity does not match this recording.');
  demand(typeof value.source_sha256==='string'&&/^[0-9a-f]{64}$/.test(value.source_sha256)&&value.source_sha256===record.source_sha256,'The saved source hash does not match this recording.');
  demand(Number.isSafeInteger(value.pts)&&value.pts>=0,'The saved PTS timestamp is invalid.');
  demand(typeof value.time_base==='string'&&/^[1-9]\d*\/[1-9]\d*$/.test(value.time_base),'The saved time base is invalid.');
  const frames=[];
  record.frames.forEach((frame,frameIndex)=>{
   if(frame.pts===value.pts&&frame.time_base===value.time_base)frames.push({frame,frameIndex});
  });
  demand(frames.length===1,'No unique sampled frame matches this timestamp and time base. No nearby frame was substituted.');
  const {frame,frameIndex}=frames[0];
  demand(typeof value.png_sha256==='string'&&/^[0-9a-f]{64}$/.test(value.png_sha256)&&value.png_sha256===frame.png_sha256,'The saved PNG image hash does not match this sampled frame.');
  demand(typeof value.encoded_seconds==='number'&&Number.isFinite(value.encoded_seconds)&&value.encoded_seconds===frame.pts_time_seconds,'The saved encoded position does not match this sampled frame.');
  demand(typeof value.browser_seek_seconds==='number'&&Number.isFinite(value.browser_seek_seconds)&&value.browser_seek_seconds===frame.browser_seek_seconds,'The saved browser seek position does not match this sampled frame.');
  demand(typeof value.source_url==='string'&&value.source_url===frame.source_passage_url,'The saved source link does not match the pinned source. It was not opened.');
  demand(value.time_scope===TIME_SCOPE&&value.presentation_rotation_scope===ROTATION_SCOPE,'The saved timing or viewing scope is not supported.');
  demand(Number.isInteger(value.presentation_rotation_ccw_degrees)&&[0,90,180,270].includes(value.presentation_rotation_ccw_degrees),'The saved viewing rotation must be 0, 90, 180 or 270 degrees.');
  return {caseIndex,recordIndex,frameIndex,rotation:value.presentation_rotation_ccw_degrees};
 }
 function parseSavedLocation(text,manifest){
  demand(typeof text==='string','The saved-location file must contain JSON text.');
  demand(text.length<=MAX_BYTES&&new TextEncoder().encode(text).byteLength<=MAX_BYTES,'The saved-location file exceeds the 64 KiB limit.');
  let value;
  try{value=JSON.parse(text.replace(/^\ufeff/,''));}catch{throw new Error('The selected file is not valid saved-location JSON.');}
  return resolveSavedLocation(value,manifest);
 }
 function createSavedLocation(manifest,caseIndex,recordIndex,frameIndex,rotation){
  demand([caseIndex,recordIndex,frameIndex].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid selected location indexes.');
  const c=manifest?.cases?.[caseIndex],r=c?.records?.[recordIndex],f=r?.frames?.[frameIndex];
  demand(c&&r&&f,'The selected location is unavailable.');
  const result={schema:SCHEMA,source_repository:manifest.source_repository,source_revision:manifest.source_revision,
   work_id:c.work_id,record_id:r.record_id,source_sha256:r.source_sha256,pts:f.pts,time_base:f.time_base,
   encoded_seconds:f.pts_time_seconds,browser_seek_seconds:f.browser_seek_seconds,png_sha256:f.png_sha256,
   source_url:f.source_passage_url,time_scope:TIME_SCOPE,presentation_rotation_ccw_degrees:rotation,presentation_rotation_scope:ROTATION_SCOPE};
  resolveSavedLocation(result,manifest);return result;
 }
 return Object.freeze({SCHEMA,MAX_BYTES,createSavedLocation,parseSavedLocation,resolveSavedLocation});
});
