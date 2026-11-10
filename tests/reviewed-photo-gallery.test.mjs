import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";

const code = readFileSync(new URL("../assets/drawing-archive.js", import.meta.url), "utf8");
class Element {
  constructor(tag="div") {this.tag=tag;this.children=[];this.textContent="";this.classList=new Set();}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children=children;}
  setAttribute() {}
  addEventListener() {}
}
function descendants(element) {return [element,...element.children.flatMap(descendants)];}
test("gallery exposes a reviewed work photograph with its evidence and full-size link", () => {
  const gallery=new Element(),pending=new Element(),nodes={};
  const render=runInNewContext(code.slice(code.indexOf("function node("),code.lastIndexOf("\ntry {"))+"\nrender",{
    gallery,pending,search:{value:""},labels:{no_published_photograph:"No photograph in this browser view"},
    getPhotographDisplayRotation:()=>{throw new Error("Normalized reviewed preview must not receive legacy rotation");},
    document:{createElement:tag=>new Element(tag),querySelector:id=>nodes[id]??=(new Element())}});
  const reviewed={displayUrl:"reviewed-photographs/one.jpg",fullResolutionUrl:"https://example.org/source.jpg",
    evidenceBasis:"Creator supplied this photograph with the drawing group.",qualification:"Endpoint equality not established.",
    sourceMetadataUrl:"https://example.org/source.json",displayDimensions:"6048 × 8064"};
  render([{workId:"tlaw-6a4a3ee3fdd84066",records:[{recordId:"tla-41667b16a88d464a",date:"2026-11-10",filename:"recording.mp4"}],
    selectedFront:null,photograph:null,reviewedPhotograph:reviewed,displayUrl:reviewed.displayUrl,referenceLinks:[],status:"no_published_photograph"}]);
  assert.equal(gallery.children.length,1);
  assert.equal(pending.children.length,0);
  const elements=descendants(gallery);
  assert.ok(elements.some(e=>e.tag==="img"&&e.src===reviewed.displayUrl));
  assert.ok(elements.some(e=>e.tag==="a"&&e.href===reviewed.fullResolutionUrl));
  assert.ok(elements.some(e=>e.textContent.includes(reviewed.qualification)));
  assert.ok(elements.some(e=>e.textContent.includes(reviewed.evidenceBasis)));
  assert.ok(!elements.some(e=>e.textContent.includes("Owner-confirmed selected front")));
});
