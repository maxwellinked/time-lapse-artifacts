'use strict';
window.installSharedLocationControls=function({manifest,getPosition,openLocation}){
 const copy=document.getElementById('copy-location-link'),status=document.getElementById('shared-location-status');
 const fallback=document.getElementById('shared-location-fallback'),field=document.getElementById('shared-location-url');
 let copying=0;
 function announce(state,message){status.hidden=false;status.dataset.state=state;status.textContent=message;}
 copy.onclick=async()=>{
  const ticket=++copying;fallback.hidden=true;field.value='';
  try{
   const url=new URL(window.location.href);
   if(!['https:','http:'].includes(url.protocol))throw new Error('Open the hosted inspection page to copy a shareable link.');
   const p=getPosition();
   url.search='';url.hash=window.SharedLocation.createFragment(manifest,p.caseIndex,p.recordIndex,p.frameIndex,p.rotation);
   const link=url.href,record=manifest.cases[p.caseIndex].records[p.recordIndex];
   const description=`${record.record_id}, sample ${p.frameIndex+1}, view turned ${p.rotation} degrees counterclockwise`;
   try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link);
    if(ticket===copying)announce('copied',`Link copied for ${description}.`);
   }catch{
    if(ticket!==copying)return;
    field.value=link;fallback.hidden=false;field.focus();field.select();
    announce('copy-ready',`Link ready for ${description}. Copy the selected address below.`);
   }
  }catch(error){if(ticket===copying)announce('rejected',error instanceof Error?error.message:'The view link could not be created.');}
 };
 window.addEventListener('hashchange',()=>openLocation(window.location.hash));
 if(window.location.hash)openLocation(window.location.hash);
};
