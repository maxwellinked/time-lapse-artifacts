// A presentation overlay consumed from a pinned Hugging Face manifest.
// No source metadata, candidate relationship or source display matrix is changed.
const HASH=/^[a-f0-9]{64}$/, REVISION=/^[a-f0-9]{40}$/;
function requireOrientation(condition,detail){
  if(!condition)throw new Error(`Invalid real-time viewing orientation: ${detail}`);
}

export function validateRealTimeOrientation(manifest,realTime,recordData){
  requireOrientation(manifest?.schemaVersion===1 && manifest.sourceRepository===realTime.sourceRepository &&
    REVISION.test(manifest.sourceRevision??"") && manifest.scope==="viewing_only" &&
    manifest.rotationBasis==="clockwise_after_source_display_rotation","manifest scope or source");
  requireOrientation(/^\d{4}-\d{2}-\d{2}$/.test(manifest.reviewedAt??""),"review date");
  requireOrientation(Array.isArray(manifest.records) && manifest.records.length===realTime.records.length,"complete collection coverage");
  const rt=new Map(realTime.records.map(r=>[r.record_id,r]));
  const tl=new Map(recordData.records.map(r=>[r.recordId,r]));
  const seen=new Set();
  for(const r of manifest.records){
    const source=rt.get(r.recordId),paired=tl.get(r.pairedRecordId);
    requireOrientation(source && !seen.has(r.recordId),"unknown or duplicate recording");seen.add(r.recordId);
    requireOrientation(r.sourcePath===source.file_name && r.sourceSha256===source.sha256,"source identity");
    requireOrientation(r.pairedRecordId===source.paired_record_id && paired &&
      r.pairedSourceXetHash===paired.integrityReference && HASH.test(r.pairedSourceSha256??""),"candidate comparison identity");
    const pairedPath=decodeURIComponent(new URL(paired.videoUrl).pathname).split("/").slice(6).join("/");
    requireOrientation(r.pairedSourcePath===pairedPath,"candidate comparison path");
    requireOrientation([0,90,180,270].includes(r.rotationClockwiseDegrees) &&
      Number.isFinite(r.sourceDisplayRotationDegrees),"quarter-turn rotation");
    requireOrientation(typeof r.reviewBasis==="string" && r.reviewBasis.length>0 &&
      Array.isArray(r.samples) && r.samples.length>0,"visual review evidence");
    for(const sample of r.samples){
      requireOrientation(["realTimeSeekSeconds","timeLapseSeekSeconds"]
        .every(k=>Number.isFinite(sample[k]) && sample[k]>=0),"sample position");
      requireOrientation(["realTimePtsSeconds","timeLapsePtsSeconds"]
        .every(k=>Object.hasOwn(sample,k) && (sample[k]===null || (Number.isFinite(sample[k]) && sample[k]>=0))),"sample PTS");
    }
  }
  return manifest;
}
