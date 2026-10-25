import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','inspection');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));

function harness({href='https://maxwellinked.github.io/time-lapse-artifacts/inspection/?unused=1#old',clipboard='available'}={}){
 const elements={},written=[],opened=[],listeners={};
 let position={caseIndex:1,recordIndex:1,frameIndex:4,rotation:270};
 for(const id of ['copy-location-link','shared-location-status','shared-location-fallback','shared-location-url']){
  elements[id]={hidden:true,textContent:'',value:'',dataset:{},focus(){this.focused=true;},select(){this.selected=true;}};
 }
 const navigator={};
 if(clipboard!=='missing')navigator.clipboard={writeText:async text=>{if(clipboard==='denied')throw new Error('Clipboard denied');written.push(text);}};
 const location=new URL(href);
 const context=vm.createContext({TextEncoder,URL,navigator,location,document:{getElementById:id=>elements[id]},addEventListener:(type,fn)=>{listeners[type]=fn;}});
 context.window=context;
 for(const file of ['saved_location.js','shared_location.js','shared_location_controls.js']){
  if(fs.existsSync(path.join(root,file)))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 }
 assert.equal(typeof context.installSharedLocationControls,'function','Copy-link controls are not installed');
 context.installSharedLocationControls({manifest,getPosition:()=>position,openLocation:hash=>opened.push(hash)});
 return {elements,written,opened,listeners,location,changePosition:p=>{position=p;},copy:()=>elements['copy-location-link'].onclick()};
}

test('Copy link captures the selected frame and rotation, removes old fragment and query, and does not navigate',async()=>{
 const h=harness();const before=h.location.href;await h.copy();
 assert.equal(h.written.length,1);const url=new URL(h.written[0]);
 assert.equal(url.origin,'https://maxwellinked.github.io');assert.equal(url.pathname,'/time-lapse-artifacts/inspection/');assert.equal(url.search,'');
 const saved=JSON.parse(decodeURIComponent(url.hash.slice('#view='.length)));
 assert.equal(saved.record_id,'tla-0b51a30242c7c88e');assert.equal(saved.pts,manifest.cases[1].records[1].frames[4].pts);
 assert.equal(saved.presentation_rotation_ccw_degrees,270);assert.equal(h.location.href,before);
 assert.equal(h.elements['shared-location-status'].dataset.state,'copied');assert.equal(h.elements['shared-location-fallback'].hidden,true);
});
test('blocked or absent clipboard shows a selected, manually copyable exact link',async()=>{
 for(const clipboard of ['denied','missing']){
  const h=harness({clipboard,href:'https://maxwellinked.github.io/time-lapse-artifacts/inspection/'});await h.copy();
  assert.equal(h.written.length,0);assert.equal(h.elements['shared-location-fallback'].hidden,false);
  assert.equal(h.elements['shared-location-url'].selected,true);assert.equal(h.elements['shared-location-url'].focused,true);
  assert.ok(h.elements['shared-location-url'].value.startsWith('https://maxwellinked.github.io/time-lapse-artifacts/inspection/#view='));
  assert.equal(h.elements['shared-location-status'].dataset.state,'copy-ready');
 }
});
test('file-based use never copies or exposes a local path',async()=>{
 const h=harness({href:'file:///private-review/inspection/index.html'});await h.copy();
 assert.equal(h.written.length,0);assert.equal(h.elements['shared-location-url'].value,'');
 assert.equal(h.elements['shared-location-status'].dataset.state,'rejected');assert.equal(h.elements['shared-location-fallback'].hidden,true);
 assert.ok(!h.elements['shared-location-status'].textContent.includes('private-review'));
});
test('each copy captures the current view rather than a previous shared URL',async()=>{
 const h=harness();await h.copy();h.changePosition({caseIndex:2,recordIndex:5,frameIndex:8,rotation:0});await h.copy();
 const saved=JSON.parse(decodeURIComponent(new URL(h.written[1]).hash.slice(6)));
 assert.equal(saved.record_id,'tla-461b870d4da0e98e');assert.equal(saved.pts,manifest.cases[2].records[5].frames[8].pts);
 assert.equal(saved.presentation_rotation_ccw_degrees,0);assert.notEqual(h.written[0],h.written[1]);
});
