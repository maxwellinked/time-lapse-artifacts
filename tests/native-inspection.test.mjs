import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

async function model() {
  const file = new URL('../inspection/native-model.js', import.meta.url);
  assert.ok(fs.existsSync(file), 'native inspection route/model must exist');
  return import(file);
}

const first = 'tla-0897038ffd1f516b';
const second = 'tla-5fe34f800eee6bb4';
const payload = {records: [{recordId: first, frames: Array.from({length:21}, (_,index)=>({index,pts:index*10,url:`https://example.org/${index}.png`}))},
                          {recordId: second, frames: Array.from({length:21}, (_,index)=>({index,pts:index*20,url:`https://example.org/second/${index}.png`}))}]};

test('overview remains unselected until a recording is requested', async () => {
  const {resolveSelection} = await model();
  assert.equal(resolveSelection(payload, '').record, null);
});

test('a native route selects only its exact record and sample', async () => {
  const {resolveSelection} = await model();
  const state=resolveSelection(payload, `?record=${second}&frame=20`);
  assert.equal(state.record.recordId,second);
  assert.equal(state.frame.index,20);
  assert.equal(state.frame.pts,400);
  assert.equal(resolveSelection(payload, `?record=${first}`).frame.index,0);
});

test('unknown malformed duplicate and out-of-range routes never substitute a frame', async () => {
  const {resolveSelection} = await model();
  for (const search of ['?record=tla-0000000000000000', '?record=bad', `?record=${first}&record=${second}`,
                         '?frame=2', `?record=${first}&frame=21`, `?record=${first}&frame=-1`,
                         `?record=${first}&frame=1.5`, `?record=${first}&frame=`,
                         `?record=${first}&frame=1&frame=2`]) {
    assert.throws(()=>resolveSelection(payload,search),/unavailable|Invalid|ambiguous/);
  }
});

test('overview action requires matching record identity and source content identity', async () => {
  const file=new URL('../assets/native-inspection-links.js',import.meta.url);
  assert.ok(fs.existsSync(file),'overview link helper must exist');
  const {nativeInspectionUrl}=await import(file);
  const records=JSON.parse(fs.readFileSync(new URL('../data/records.json',import.meta.url),'utf8')).records;
  const record=records.find(item=>item.recordId===first);
  assert.ok(record);
  assert.equal(nativeInspectionUrl(record),`inspection/native.html?record=${first}`);
  assert.equal(nativeInspectionUrl({...record,integrityReference:'0'.repeat(64)}),null);
  assert.equal(nativeInspectionUrl({...record,recordId:'tla-0000000000000000'}),null);
  assert.equal(nativeInspectionUrl(null),null);
});
