import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','inspection');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

// Only browser I/O is simulated. These tests execute the real identity parser and controller.
function harness(){
 const manifest=structuredClone(fixture),elements={},images=[],timers=new Map(),restored=[];
 let now=0,sequence=0,view=0,reads=0;
 for(const id of ['open-location','saved-location-file','saved-location-status','bookmark','retry-location','cancel-location']){
  elements[id]={hidden:true,dataset:{},textContent:'',value:'',files:[],click(){this.clicks=(this.clicks||0)+1;}};
 }
 class TestImage{
  constructor(){this.naturalWidth=2160;this.naturalHeight=3840;images.push(this);}
  set src(value){this.url=value;}
  get src(){return this.url;}
  removeAttribute(name){if(name==='src')this.url='';}
 }
 const context=vm.createContext({TextEncoder,Image:TestImage,Blob,URL,
  document:{getElementById:id=>elements[id],createElement:()=>({click(){}})},
  setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{at:now+delay,fn});return id;},
  clearTimeout:id=>timers.delete(id)});
 context.window=context;
 for(const file of ['saved_location.js','saved_location_controls.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 if(fs.existsSync(path.join(root,'shared_location.js')))vm.runInContext(fs.readFileSync(path.join(root,'shared_location.js'),'utf8'),context);
 const controls=context.installSavedLocationControls({manifest,getPosition:()=>({caseIndex:0,recordIndex:0,frameIndex:0,rotation:90}),getViewVersion:()=>view,restoreLocation:r=>restored.push(JSON.parse(JSON.stringify(r)))});
 const good=()=>JSON.parse(JSON.stringify(context.SavedLocation.createSavedLocation(manifest,1,1,4,90)));
 return {manifest,images,timers,restored,elements,good,
  state:()=>elements['saved-location-status'].dataset.state,
  message:()=>elements['saved-location-status'].textContent,
  reads:()=>reads,
  changeView:()=>{view++;},
  share:async hash=>{assert.equal(typeof controls?.openSharedLocation,'function','Shared locations must use the existing loader');controls.openSharedLocation(hash);await flush();},
  select:async(value=good(),options={})=>{
   const text=typeof value==='string'?value:JSON.stringify(value);
   elements['saved-location-file'].files=[{size:options.size??Buffer.byteLength(text),text:()=>{reads++;return options.read?options.read():Promise.resolve(text);}}];
   void elements['saved-location-file'].onchange();await flush();
  },
  tick:async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,t]=next;timers.delete(id);now=t.at;t.fn();await flush();}now=end;await flush();},
  retry:async()=>{assert.equal(typeof elements['retry-location'].onclick,'function','Retry handler missing');elements['retry-location'].onclick();await flush();},
  cancel:async()=>{assert.equal(typeof elements['cancel-location'].onclick,'function','Cancel handler missing');elements['cancel-location'].onclick();await flush();},
  success:async(image=images.at(-1))=>{image.onload?.();await flush();},
  failure:async(image=images.at(-1))=>{image.onerror?.();await flush();}
 };
}

test('valid slow image stays pending after 15 seconds and can restore without another file read',async()=>{
 const h=harness();await h.select();assert.match(h.message(),/matches.*loading/i);
 await h.tick(16000);assert.equal(h.state(),'waiting');assert.equal(h.restored.length,0);assert.equal(h.reads(),1);
 assert.equal(h.elements['retry-location'].hidden,false);assert.equal(h.elements['cancel-location'].hidden,false);
 await h.success();assert.equal(h.state(),'restored');assert.deepEqual(h.restored,[{caseIndex:1,recordIndex:1,frameIndex:4,rotation:90}]);
 assert.equal(h.reads(),1);assert.equal(h.elements['retry-location'].hidden,true);assert.equal(h.elements['cancel-location'].hidden,true);
});
test('failed image can retry the same exact location without selecting or reading the file again',async()=>{
 const h=harness();await h.select();await h.failure();assert.equal(h.state(),'image-unavailable');assert.equal(h.restored.length,0);
 const first=h.images[0].url;await h.retry();assert.equal(h.images.length,2);assert.equal(h.images[1].url,first);assert.equal(h.reads(),1);
 await h.success();assert.equal(h.state(),'restored');assert.equal(h.restored.length,1);
});
test('cancel blocks a late load callback and removes recovery controls',async()=>{
 const h=harness();await h.select();const late=h.images[0].onload;await h.cancel();late();await flush();await h.tick(20000);
 assert.equal(h.state(),'cancelled');assert.equal(h.restored.length,0);assert.equal(h.timers.size,0);
 assert.equal(h.elements['retry-location'].hidden,true);assert.equal(h.elements['cancel-location'].hidden,true);
});
test('retry invalidates the earlier image attempt without automatic retry requests',async()=>{
 const h=harness();await h.select();const late=h.images[0].onload;await h.tick(16000);assert.equal(h.images.length,1);
 await h.retry();late();await flush();assert.equal(h.restored.length,0);await h.success();assert.equal(h.restored.length,1);
});
test('changing the current view cancels a delayed restore',async()=>{
 const h=harness();await h.select();h.changeView();await h.success();assert.equal(h.state(),'cancelled');assert.equal(h.restored.length,0);
});
test('Retry also respects a view change made after the image failed',async()=>{
 const h=harness();await h.select();await h.failure();h.changeView();await h.retry();assert.equal(h.state(),'cancelled');assert.equal(h.images.length,1);
});
test('a new file supersedes the previous pending image',async()=>{
 const h=harness();await h.select();const late=h.images[0].onload;const other=h.good();other.presentation_rotation_ccw_degrees=270;
 await h.select(other);late();await flush();assert.equal(h.restored.length,0);await h.success();assert.equal(h.restored[0].rotation,270);
});
test('cancel while the local file is being read cannot restore after its read completes',async()=>{
 const h=harness();let finish;await h.select(h.good(),{read:()=>new Promise(resolve=>{finish=resolve;})});
 await h.cancel();finish(JSON.stringify(h.good()));await flush();assert.equal(h.state(),'cancelled');assert.equal(h.images.length,0);
});
test('wrong source identity is rejected before requesting an image, without Retry',async()=>{
 const h=harness();await h.select({...h.good(),source_sha256:'0'.repeat(64)});assert.equal(h.state(),'rejected');assert.equal(h.images.length,0);
 assert.equal(h.elements['retry-location'].hidden,true);assert.equal(h.elements['cancel-location'].hidden,true);
});
test('malformed and oversized files remain rejected before image loading',async()=>{
 for(const [value,options] of [['{bad',{}],['x',{size:65537}]]){
  const h=harness();await h.select(value,options);assert.equal(h.state(),'rejected');assert.equal(h.images.length,0);assert.equal(h.restored.length,0);
 }
});
test('Retry revalidates the retained JSON instead of bypassing changed bindings',async()=>{
 const h=harness();await h.select();await h.failure();h.manifest.source_revision='0'.repeat(40);await h.retry();
 assert.equal(h.state(),'rejected');assert.equal(h.images.length,1);assert.equal(h.restored.length,0);
});
test('a loaded image with wrong dimensions never replaces the current view',async()=>{
 const h=harness();await h.select();h.images[0].naturalWidth=1;await h.success();assert.equal(h.state(),'image-unavailable');assert.equal(h.restored.length,0);
});
test('normal immediate success needs no recovery controls or extra image request',async()=>{
 const h=harness();await h.select();await h.success();assert.equal(h.state(),'restored');assert.equal(h.images.length,1);assert.equal(h.timers.size,0);
});
test('opening the file picker cancels an outstanding restore even if no new file is chosen',async()=>{
 const h=harness();await h.select();const late=h.images[0].onload;h.elements['open-location'].onclick();late();await flush();
 assert.equal(h.state(),'cancelled');assert.equal(h.restored.length,0);assert.equal(h.elements['saved-location-file'].clicks,1);
});
test('recovery buttons are ordinary hidden controls, not a style change',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const id of ['retry-location','cancel-location'])assert.match(html,new RegExp(`<button[^>]+id="${id}"[^>]+hidden`));
});

const fragment=value=>'#view='+encodeURIComponent(JSON.stringify(value));
test('a shared location restores through the same slow-loading path without reading a file',async()=>{
 const h=harness();await h.share(fragment(h.good()));await h.tick(16000);
 assert.equal(h.state(),'waiting');assert.equal(h.restored.length,0);assert.equal(h.reads(),0);
 await h.success();assert.deepEqual(h.restored,[{caseIndex:1,recordIndex:1,frameIndex:4,rotation:90}]);
});
test('an unavailable shared image can retry without reopening a file',async()=>{
 const h=harness();await h.share(fragment(h.good()));await h.failure();assert.equal(h.state(),'image-unavailable');
 await h.retry();await h.success();assert.equal(h.state(),'restored');assert.equal(h.reads(),0);
});
test('malformed and changed-identity links request no target image and preserve the current view',async()=>{
 for(const hash of ['#view=%',fragment({...harness().good(),source_revision:'0'.repeat(40)}),'#view=','#!other']){
  const h=harness();await h.share(hash);assert.equal(h.state(),'rejected');assert.equal(h.images.length,0);assert.equal(h.restored.length,0);
 }
});
test('a later shared link supersedes a pending file or link, including late callbacks',async()=>{
 for(const first of ['file','link']){
  const h=harness();if(first==='file')await h.select();else await h.share(fragment(h.good()));
  const late=h.images[0].onload;const other={...h.good(),presentation_rotation_ccw_degrees:270};
  await h.share(fragment(other));late();await flush();assert.equal(h.restored.length,0);
  await h.success();assert.deepEqual(h.restored,[{caseIndex:1,recordIndex:1,frameIndex:4,rotation:270}]);
 }
});
test('clearing or rejecting the URL fragment cancels an earlier pending shared image',async()=>{
 for(const hash of ['', '#view=%']){
  const h=harness();await h.share(fragment(h.good()));const late=h.images[0].onload;
  await h.share(hash);late();await h.tick(20000);assert.equal(h.restored.length,0);assert.equal(h.timers.size,0);
  assert.equal(h.state(),hash?'rejected':'cancelled');
 }
});
test('navigation and Cancel prevent a pending shared link from replacing the new view',async()=>{
 for(const action of ['navigate','cancel']){
  const h=harness();await h.share(fragment(h.good()));const late=h.images[0].onload;
  if(action==='navigate')h.changeView();else await h.cancel();late();await flush();
  assert.equal(h.state(),'cancelled');assert.equal(h.restored.length,0);
 }
});
