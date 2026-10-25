'use strict';
(() => {
 const data=window.INSPECTION;
 if(!data||!Array.isArray(data.cases))throw new Error('Inspection manifest unavailable. Keep data.js beside index.html.');
 const $=id=>document.getElementById(id);
 let ci=0,ri=0,fi=0,native=false,request=0,imageRequest=0,presentationRotation=90,interactionVersion=0;
 const currentCase=()=>data.cases[ci],record=()=>currentCase().records[ri],frame=()=>record().frames[fi];
 const time=t=>`${Math.floor(t/60)}:${(t%60).toFixed(3).padStart(6,'0')}`;
 function button(text,callback,cls){const b=document.createElement('button');b.textContent=text;b.onclick=callback;if(cls)b.className=cls;return b;}
 function a(text,url){const link=document.createElement('a');link.textContent=text;link.href=url;link.target='_blank';link.rel='noopener';return link;}
 function p(text,cls){const el=document.createElement('p');el.textContent=text;if(cls)el.className=cls;return el;}
 function clearVideo(){request++;const v=$('video');v.pause();v.removeAttribute('src');v.load();$('playback-panel').hidden=true;$('seek-status').textContent='';$('presented-time').textContent='';}
 function selectCase(i){ci=i;ri=0;fi=0;clearVideo();renderCase();}
 function selectRecord(i){ri=i;fi=0;clearVideo();renderRecords();renderRecord();}
 function renderCase(frameIndex=0){
  $('cases').replaceChildren(...data.cases.map((c,i)=>{const b=button(`${i+1}. ${c.title}`,()=>selectCase(i));b.dataset.caseId=c.id;b.setAttribute('aria-pressed',i===ci);return b;}));
  const c=currentCase();$('case-title').textContent=c.title;$('work-id').textContent=c.work_id;$('selection').textContent=c.selection_reason;
  $('photo').replaceChildren();
  if(c.presentation_note)$('photo').append(p(c.presentation_note,'muted'));
  for(const reference of c.recording_references||[]){
   const h=document.createElement('h3');h.textContent=reference.label;
   const img=document.createElement('img');img.src=reference.image_url;img.alt='Creator-confirmed photograph of an additional drawing in this recording';img.loading='lazy';img.width=reference.width;img.height=reference.height;
   const links=p('');links.append(a('Open photograph',reference.image_url),document.createTextNode(' · '),a('Reference evidence',reference.evidence_url));
   $('photo').append(h,img,p('Creator-confirmed recording reference. No work ID assigned here.','muted'),links);
  }
  if(c.photograph){
   const photo=c.photograph;const h=document.createElement('h3');h.textContent=c.recording_references?.length?'Indexed work photograph':'Selected work photograph';const img=document.createElement('img');img.src=photo.thumbnail;img.alt='Selected photograph of this work; not an exact recording endpoint';
   $('photo').append(h,img,p(photo.resolution_class.replaceAll('_',' '),'muted'),p('Work reference only—not an exact recording endpoint or a verified pixel alignment.','muted'),a('Open source-bound photograph',photo.local_path));
  }else{$('photo').append(p('No selected photograph at this revision.'),p('This is an absent selection, not evidence that no photograph exists.','muted'));}
  renderRecords();renderRecord(frameIndex);
 }
 function renderRecords(){
  $('records').replaceChildren(...currentCase().records.map((r,i)=>{
   const b=button('',()=>selectRecord(i),'record-button');b.dataset.recordId=r.record_id;b.setAttribute('aria-pressed',i===ri);
   const title=document.createElement('strong');title.textContent=`Recording ${i+1} of ${currentCase().records.length}`;
   const subtitle=document.createElement('span');subtitle.textContent=`${time(Number(r.duration_seconds))} encoded · ${r.codec}`;
   b.append(title,subtitle);return b;
  }));
 }
 function renderRecord(frameIndex=0){
  const r=record(),rel=r.relationship;
  $('record-title').textContent=`Recording ${ri+1} / ${currentCase().records.length}`;$('record-id').textContent=r.record_id;
  $('record-boundary').textContent=rel?`Listed position ${rel.sequence_position} of ${rel.sequence_count}. ${rel.sequence_completeness==='unknown'?'Capture completeness remains unknown.':'Recorded source-set completeness assertion retained; this does not establish gapless capture.'}`:'One indexed recording for this work; complete-process capture is not inferred.';
  $('strip').replaceChildren(...r.frames.map((f,i)=>{const b=button('',()=>selectFrame(i),'sample');b.dataset.sample=i;b.setAttribute('aria-label',`Sample ${i+1}, encoded ${time(f.pts_time_seconds)}`);const img=document.createElement('img');img.src=f.thumbnail;img.alt=`Navigation thumbnail ${i+1}`;const label=document.createElement('span');label.textContent=time(f.pts_time_seconds);b.append(img,label);return b;}));
  window.renderRecordedChecks?.(r,data.source_revision);
  selectFrame(frameIndex);
 }
 function selectFrame(i){
  interactionVersion++;
  if(!$('playback-panel').hidden)clearVideo();
  fi=i;const f=frame(),r=record();
  for(const [j,b] of Array.from($('strip').children).entries())b.setAttribute('aria-pressed',j===fi);
  $('previous').disabled=fi===0;$('next').disabled=fi===r.frames.length-1;
  $('sample-title').textContent=`Sample ${fi+1} of ${r.frames.length}`;
  $('sample-time').textContent=`Encoded ${time(f.pts_time_seconds)} · PTS ${f.pts} × ${f.time_base}`;
  const img=$('frame'),loadId=++imageRequest,key=`${r.record_id}/${fi}`;
  img.style.visibility='hidden';img.dataset.loadedSample='';$('frame-viewport').setAttribute('aria-busy','true');
  img.onload=()=>{if(loadId===imageRequest&&img.currentSrc===new URL(f.png,document.baseURI).href){img.dataset.loadedSample=key;layoutFrame();img.style.visibility='visible';$('frame-viewport').setAttribute('aria-busy','false');}};
  img.onerror=()=>{if(loadId===imageRequest){$('resolution-note').textContent='The exact sample could not load. No previous or substitute image is displayed.';$('frame-viewport').setAttribute('aria-busy','false');}};
  img.src=f.png;img.alt=`Decoded sample ${fi+1} from ${r.record_id}, encoded position ${f.pts_time_seconds.toFixed(6)} seconds`;
  $('frame-viewport').scrollTop=0;$('frame-viewport').scrollLeft=0;
  $('resolution-note').textContent=`${f.width} × ${f.height} decoded pixels. Full uncropped frame; declared display rotation applied once. Fit view and thumbnail may conceal fine marks; Native pixels shows the unscaled decoded PNG.`;
  $('png-link').href=f.png;$('hub-link').href=f.source_passage_url;
  const pre=document.createElement('pre');pre.textContent=JSON.stringify({source_repository:data.source_repository,source_revision:data.source_revision,work_id:currentCase().work_id,record_id:r.record_id,canonical_file:r.file_name,source_sha256:r.source_sha256,pts:f.pts,time_base:f.time_base,encoded_seconds:f.pts_time_seconds,browser_seek_seconds:f.browser_seek_seconds,decoded_png_sha256:f.png_sha256,declared_rotation_degrees:f.display_rotation_metadata_degrees,transform:f.transform,relationship:r.relationship,work_link:r.work_link},null,2);
  $('evidence').replaceChildren(pre);
  window.inspectionState={case_id:currentCase().id,record_id:r.record_id,sample_index:fi,pts:f.pts,encoded_seconds:f.pts_time_seconds,presentation_rotation_ccw_degrees:presentationRotation};
  layoutFrame();
 }
 function layoutFrame(){
  const f=frame(),v=$('frame-viewport'),stage=$('frame-stage'),img=$('frame');
  const quarterTurn=presentationRotation%180!==0;
  const width=quarterTurn?f.height:f.width,height=quarterTurn?f.width:f.height;
  const scale=native?1:Math.min(1,Math.max(1,v.clientWidth-2)/width,Math.max(1,v.clientHeight-2)/height);
  stage.style.width=`${width*scale}px`;stage.style.height=`${height*scale}px`;
  img.style.width=`${f.width*scale}px`;img.style.height=`${f.height*scale}px`;
  img.style.transform=`translate(-50%,-50%) rotate(${-presentationRotation}deg)`;
  $('rotation-note').textContent=presentationRotation?`View turned ${presentationRotation} degrees counterclockwise. Presentation only; source files and decoded PNGs are unchanged.`:'View matches the decoded PNG orientation. No additional viewing rotation.';
  if(window.inspectionState)window.inspectionState.presentation_rotation_ccw_degrees=presentationRotation;
  const pre=$('evidence').querySelector('pre');
  if(pre){const evidence=JSON.parse(pre.textContent);evidence.presentation_rotation_ccw_degrees=presentationRotation;evidence.presentation_rotation_scope='selected-frame viewport only; no source-orientation assertion';pre.textContent=JSON.stringify(evidence,null,2);}
 }
 function sizing(value){interactionVersion++;native=value;$('frame-viewport').classList.toggle('native',native);$('native').setAttribute('aria-pressed',native);$('fit').setAttribute('aria-pressed',!native);layoutFrame();$('frame-viewport').scrollTop=0;$('frame-viewport').scrollLeft=0;}
 function rotateView(degrees){interactionVersion++;presentationRotation=((degrees%360)+360)%360;layoutFrame();$('frame-viewport').scrollTop=0;$('frame-viewport').scrollLeft=0;}

 async function loadSource(){
  interactionVersion++;
  const r=record(),f=frame(),v=$('video'),myRequest=++request;
  $('playback-panel').hidden=false;$('seek-status').textContent='Loading the pinned original source; no proxy or substitute is being used.';$('presented-time').textContent='';
  const seek=()=>{
   if(myRequest!==request)return;
   v.pause();v.muted=true;
   if('requestVideoFrameCallback' in v)v.requestVideoFrameCallback((_,meta)=>{
    if(myRequest!==request)return;
    const error=Math.abs(meta.mediaTime-f.pts_time_seconds);
    $('presented-time').textContent=`Presented frame timestamp: ${meta.mediaTime.toFixed(6)} s; difference from sample: ${error.toFixed(6)} s.`;
    window.lastPresentedFrame={record_id:r.record_id,requested:f.pts_time_seconds,mediaTime:meta.mediaTime,difference:error};
   });
   v.currentTime=f.browser_seek_seconds;
   $('seek-status').textContent=`Selected source PTS ${time(f.pts_time_seconds)}; browser seek ${f.browser_seek_seconds.toFixed(6)} s, inside that frame?s encoded interval. The displayed frame timestamp is checked separately.`;
  };
  v.onerror=()=>{if(myRequest===request)$('seek-status').textContent='This browser could not decode the source. The exact PNGs remain usable; use the pinned original-source link with a compatible player. No proxy was substituted.';};
  const uri=r.source_url;
  if(v.dataset.recordId===r.record_id&&v.readyState>=1)seek();
  else{v.dataset.recordId=r.record_id;v.onloadedmetadata=seek;v.src=uri;v.load();}
 }
 $('previous').onclick=()=>{if(fi>0)selectFrame(fi-1);};$('next').onclick=()=>{if(fi<record().frames.length-1)selectFrame(fi+1);};
 $('fit').onclick=()=>sizing(false);$('native').onclick=()=>sizing(true);$('seek-source').onclick=loadSource;
 $('rotate-ccw').onclick=()=>rotateView(presentationRotation+90);$('reset-rotation').onclick=()=>rotateView(0);
 new ResizeObserver(()=>layoutFrame()).observe($('frame-viewport'));
 const locationControls=window.installSavedLocationControls({
  manifest:data,
  getPosition:()=>({caseIndex:ci,recordIndex:ri,frameIndex:fi,rotation:presentationRotation}),
  getViewVersion:()=>interactionVersion,
  restoreLocation:target=>{
   clearVideo();ci=target.caseIndex;ri=target.recordIndex;fi=target.frameIndex;presentationRotation=target.rotation;
   native=false;$('frame-viewport').classList.remove('native');$('native').setAttribute('aria-pressed',false);$('fit').setAttribute('aria-pressed',true);
   renderCase(target.frameIndex);
  }
 });
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','VIDEO'].includes(document.activeElement.tagName))return;if(e.key==='ArrowRight'&&fi<record().frames.length-1){e.preventDefault();selectFrame(fi+1);}if(e.key==='ArrowLeft'&&fi>0){e.preventDefault();selectFrame(fi-1);}});
 $('revision').textContent=`Source revision ${data.source_revision} · Three inspection cases, not a representative sample`;
 renderCase();
 window.installSharedLocationControls({
  manifest:data,
  getPosition:()=>({caseIndex:ci,recordIndex:ri,frameIndex:fi,rotation:presentationRotation}),
  openLocation:hash=>locationControls.openSharedLocation(hash)
 });
})();
