'use strict';
// Presentation of retained receipts only; never starts media or fetches evidence.
(() => {
 const fields=['full_decode','demux','source_samples','local_fixity','inspection_samples','browser_seek'];
 const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 const sourcePrefix='https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/';
 function referenceLink(ref,index){
  if(!ref||(!ref.url&&ref.local_path!=='evidence/validation-summary.json'))throw new Error('Unrecognized receipt location');
  if(ref.url&&!ref.url.startsWith(sourcePrefix+ref.source_revision+'/'))throw new Error('Unpinned receipt link');
  const link=document.createElement('a');link.textContent=`Receipt ${index+1}: ${ref.locator}`;
  link.href=ref.url||ref.local_path;link.target='_blank';link.rel='noopener';
  link.title=`${ref.source_key}\nRevision ${ref.source_revision}\nSHA-256 ${ref.sha256}`;
  return link;
 }
 window.renderRecordedChecks=(record,revision)=>{
  const host=document.getElementById('recorded-checks');if(!host)return;
  host.replaceChildren();host.dataset.recordId='';host.dataset.lookupState='unavailable';
  try{
   const data=window.RECORDED_CHECKS,entry=data?.records?.[record.record_id];
   if(data?.schema!=='inspection-recorded-checks/v1'||data.source_revision!==revision||
      !entry||entry.source_revision!==revision||entry.record_id!==record.record_id||
      entry.source_sha256!==record.source_sha256||entry.work_id!==record.work_id||
      !fields.every(key=>entry.checks?.[key]&&Array.isArray(entry.checks[key].references)))throw new Error('Lookup does not match this source');
   const content=document.createDocumentFragment();
   content.append(text('p',record.record_id,'mono'),text('p',`Retained receipts, not tests rerun by this view. Archive revision ${revision.slice(0,12)}. Local check summaries are distinguished from published source receipts.`,'muted'));
   for(const [scope,title] of [['source_history','Source-file history'],['prototype_history','Prototype checks']]){
    content.append(text('h3',title));
    for(const kind of fields){
     const result=entry.checks[kind];if(result.scope!==scope)continue;
     const block=document.createElement('section');block.dataset.checkKind=kind;block.dataset.checkStatus=result.status;
     const summary=document.createElement('p');summary.append(text('strong',result.title+': '),document.createTextNode(result.summary));
     block.append(summary,text('p',result.qualification,'muted'));
     const links=document.createElement('p');result.references.forEach((ref,i)=>{if(i)links.append(document.createTextNode(' | '));links.append(referenceLink(ref,i));});
     block.append(links);content.append(block);
    }
   }
   content.append(text('p','These checks do not establish complete capture of the physical drawing process.','muted'));
   host.replaceChildren(content);host.dataset.recordId=record.record_id;host.dataset.lookupState='available';
  }catch{
   host.replaceChildren(text('p','Recorded checks are unavailable for this exact source binding. The recording and image controls remain available. This is not a failed media test.','muted'));
  }
 };
})();
