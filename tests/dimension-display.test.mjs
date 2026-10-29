import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import {buildClarificationPage} from "../tools/build-photograph-clarifications.mjs";

const source=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const formatter=source.match(/function formatDimensions\(value\) \{[\s\S]*?\n\}/);
assert.ok(formatter,"The recording views' shared dimension formatter is available");
const format=runInNewContext("("+formatter[0]+")");

test("recording dimension labels preserve the literal unit scope",()=>{
  assert.equal(format("9x12"),"9 × 12");
  assert.equal(format("12x9 in"),"12 × 9 in");
  assert.equal(format("21x29.7 cm"),"21 × 29.7 cm");
  assert.equal(format("UnknownDimensions"),"UnknownDimensions");
});

test("unlinked recording clarification labels never append an inferred unit",()=>{
  const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
  const data=read("../data/records.json"),refs=read("../data/physical-references.json"),proof=read("../data/reference-link-evidence.json");
  const row=data.records.find(record=>refs.records[record.recordId].selectionStatus==="missing_work_link");
  assert.ok(row,"The accepted batch contains an explicitly unlinked recording");
  for(const dimensions of ["9x12","9x12 cm"]) {
    row.dimensions=dimensions;
    const before=JSON.stringify([data,refs,proof]);
    const html=buildClarificationPage(data,refs,proof);
    assert.ok(html.includes(` · ${dimensions}</h2>`));
    assert.ok(!html.includes(` · ${dimensions} in</h2>`));
    assert.equal(JSON.stringify([data,refs,proof]),before);
  }
});
