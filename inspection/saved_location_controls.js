'use strict';
// File and shared-location loading. Imported URLs never load images or media.
window.installSavedLocationControls=function({manifest,getPosition,getViewVersion,restoreLocation}){
 const open=document.getElementById('open-location'),input=document.getElementById('saved-location-file');
 const status=document.getElementById('saved-location-status'),save=document.getElementById('bookmark');
 const retry=document.getElementById('retry-location'),cancel=document.getElementById('cancel-location');
 const api=window.SavedLocation;let generation=0,pending=null;
 function announce(state,message){status.hidden=false;status.dataset.state=state;status.textContent=message;}
 function recovery(canRetry,canCancel){retry.hidden=!canRetry;cancel.hidden=!canCancel;}
 function stopPending(){
  generation++;const previous=pending;pending=null;
  previous?.stop?.();recovery(false,false);
 }
 function current(job){
  if(pending!==job||job.ticket!==generation)return false;
  if(job.viewVersion!==getViewVersion()){
   stopPending();announce('cancelled','Opening was cancelled because you changed the view. Your current selection is unchanged.');return false;
  }
  return true;
 }
 function reject(job,error){
  if(!current(job))return;
  stopPending();announce('rejected',error instanceof Error?error.message:'The saved location could not be opened.');
 }
 function loadImage(job){
  if(!current(job))return;
  let target,frame;
  try{
   // Revalidate retained JSON on every Retry, using the unchanged identity parser.
   target=api.parseSavedLocation(job.text,manifest);
   frame=manifest.cases[target.caseIndex].records[target.recordIndex].frames[target.frameIndex];
   const base=manifest.asset_base_url;
   const pinned=typeof base==='string'&&/^https:\/\/huggingface\.co\/datasets\/maxwellinked\/time-lapse-artifacts-derived\/resolve\/[0-9a-f]{40}\/artifacts\/inspection-v1-2026-10-25\/$/.test(base);
   if(!pinned||typeof frame.png!=='string'||!frame.png.startsWith(base)||!/^assets\/tla-[0-9a-f]{16}\/\d{2}\.png$/.test(frame.png.slice(base.length))){
    throw new Error('The exact sampled image has an unsupported pinned asset path.');
   }
  }catch(error){reject(job,error);return;}
  announce('loading-image','Saved location matches. Loading its image; your current selection is unchanged.');
  recovery(false,true);
  const image=new Image();let settled=false;
  const timer=setTimeout(()=>{
   if(!settled&&current(job)){
    announce('waiting','Saved location matches; the image is still loading. Keep waiting, retry, or cancel.');
    recovery(true,true);
   }
  },15000);
  function detach(){clearTimeout(timer);image.onload=null;image.onerror=null;}
  job.stop=()=>{settled=true;detach();image.removeAttribute('src');};
  function finish(error){
   if(settled)return;
   settled=true;detach();job.stop=null;
   if(!current(job))return;
   if(error){announce('image-unavailable',error.message);recovery(true,true);return;}
   stopPending();restoreLocation(target);
   announce('restored','Restored the saved recording, sample and viewing rotation. Fit view; video playback has not started.');
  }
  image.onload=()=>finish(image.naturalWidth===frame.width&&image.naturalHeight===frame.height?null:new Error('The sampled image dimensions do not match. Retry or cancel; your current selection is unchanged.'));
  image.onerror=()=>finish(new Error('Saved location matches, but its image could not load. Retry or cancel; your current selection is unchanged.'));
  image.src=frame.png;
 }
 open.onclick=()=>{
  const wasPending=Boolean(pending);stopPending();
  if(wasPending)announce('cancelled','Previous opening cancelled. Your current selection is unchanged.');
  input.value='';input.click();
 };
 input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file)return;
  stopPending();const job={ticket:generation,viewVersion:getViewVersion(),text:null,stop:null};pending=job;
  announce('loading','Checking saved location...');recovery(false,true);
  try{
   if(!api)throw new Error('Saved-location support is unavailable. Keep its scripts beside index.html.');
   if(!Number.isSafeInteger(file.size)||file.size>api.MAX_BYTES)throw new Error('The saved-location file exceeds the 64 KiB limit.');
   let text;
   try{text=await file.text();}catch{throw new Error('The selected saved-location file could not be read.');}
   if(!current(job))return;
   job.text=text;loadImage(job);
  }catch(error){reject(job,error);}
 };
 retry.onclick=()=>{
  const previous=pending;if(!previous||typeof previous.text!=='string'||!current(previous))return;
  const text=previous.text;stopPending();
  const job={ticket:generation,viewVersion:getViewVersion(),text,stop:null};pending=job;loadImage(job);
 };
 cancel.onclick=()=>{if(!pending)return;stopPending();announce('cancelled','Opening cancelled. Your current selection is unchanged.');};
 save.onclick=()=>{
  try{
   if(!api)throw new Error('Saved-location support is unavailable. Keep its scripts beside index.html.');
   const p=getPosition(),value=api.createSavedLocation(manifest,p.caseIndex,p.recordIndex,p.frameIndex,p.rotation);
   const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=`${value.record_id}-pts-${value.pts}.json`;link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   if(!pending)announce('saved','Saved location file requested. It records this sample and viewing rotation, not zoom or scroll.');
  }catch(error){if(!pending)announce('rejected',error instanceof Error?error.message:'The location could not be saved.');}
 };
 recovery(false,false);
 return Object.freeze({openSharedLocation(hash){
  const wasPending=Boolean(pending);stopPending();
  if(hash===''){
   if(wasPending)announce('cancelled','Opening cancelled because the shared location was removed. Your current selection is unchanged.');
   return;
  }
  const job={ticket:generation,viewVersion:getViewVersion(),text:null,stop:null};pending=job;
  try{
   if(!window.SharedLocation)throw new Error('Shared-location support is unavailable.');
   job.text=window.SharedLocation.parseFragment(hash,manifest);
   loadImage(job);
  }catch(error){reject(job,error);}
 }});
};
