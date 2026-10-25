'use strict';
// Local file controls. Imported URLs are never used to load images or media.
window.installSavedLocationControls=function({manifest,getPosition,getViewVersion,restoreLocation}){
 const open=document.getElementById('open-location'),input=document.getElementById('saved-location-file');
 const status=document.getElementById('saved-location-status'),save=document.getElementById('bookmark');
 const api=window.SavedLocation;let generation=0;
 function announce(state,message){status.hidden=false;status.dataset.state=state;status.textContent=message;}
 function stillCurrent(ticket,viewVersion){
  if(ticket!==generation)return false;
  if(viewVersion!==getViewVersion()){
   announce('cancelled','Opening was cancelled because you changed the view. Your current selection is unchanged.');return false;
  }
  return true;
 }
 function preloadFrame(frame){
  return new Promise((resolve,reject)=>{
   // Only revision-pinned PNG assets from the loaded manifest are permitted; never follow an imported path.
   const base=manifest.asset_base_url;
   const pinned=typeof base==='string'&&/^https:\/\/huggingface\.co\/datasets\/maxwellinked\/time-lapse-artifacts-derived\/resolve\/[0-9a-f]{40}\/artifacts\/inspection-v1-2026-10-25\/$/.test(base);
   if(!pinned||typeof frame.png!=='string'||!frame.png.startsWith(base)||!/^assets\/tla-[0-9a-f]{16}\/\d{2}\.png$/.test(frame.png.slice(base.length))){
    reject(new Error('The exact sampled image has an unsupported pinned asset path.'));return;
   }
   const image=new Image();let finished=false;
   const timer=setTimeout(()=>finish(new Error('The exact sampled image did not load. The current selection was kept.')),15000);
   function finish(error){if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve();}
   image.onload=()=>finish(image.naturalWidth===frame.width&&image.naturalHeight===frame.height?null:new Error('The sampled image dimensions do not match this location. The current selection was kept.'));
   image.onerror=()=>finish(new Error('The exact sampled image is unavailable. The current selection was kept.'));
   image.src=frame.png;
  });
 }
 open.onclick=()=>{generation++;input.value='';input.click();};
 input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file)return;
  const ticket=++generation,viewVersion=getViewVersion();
  announce('loading','Checking saved location...');
  try{
   if(!api)throw new Error('Saved-location support is unavailable. Keep its scripts beside index.html.');
   if(!Number.isSafeInteger(file.size)||file.size>api.MAX_BYTES)throw new Error('The saved-location file exceeds the 64 KiB limit.');
   let text;
   try{text=await file.text();}catch{throw new Error('The selected saved-location file could not be read.');}
   if(!stillCurrent(ticket,viewVersion))return;
   const target=api.parseSavedLocation(text,manifest);
   const frame=manifest.cases[target.caseIndex].records[target.recordIndex].frames[target.frameIndex];
   await preloadFrame(frame);
   if(!stillCurrent(ticket,viewVersion))return;
   restoreLocation(target);
   announce('restored','Restored the saved recording, sample and viewing rotation. Fit view; video playback has not started.');
  }catch(error){
   if(stillCurrent(ticket,viewVersion))announce('rejected',error instanceof Error?error.message:'The saved location could not be opened. The current selection was kept.');
  }
 };
 save.onclick=()=>{
  try{
   if(!api)throw new Error('Saved-location support is unavailable. Keep its scripts beside index.html.');
   const p=getPosition(),value=api.createSavedLocation(manifest,p.caseIndex,p.recordIndex,p.frameIndex,p.rotation);
   const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=`${value.record_id}-pts-${value.pts}.json`;link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   announce('saved','Saved location file requested. It records this sample and viewing rotation, not zoom or scroll.');
  }catch(error){announce('rejected',error instanceof Error?error.message:'The location could not be saved.');}
 };
};
