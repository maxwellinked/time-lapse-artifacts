import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';

let module = {};
try { module = await import('../assets/candidate-photographs.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const root = new URL('../', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root)));
function fixture() {
  assert.equal(typeof module.buildCandidatePhotographIndex, 'function', 'Candidate source photograph access is implemented');
  return [read('data/candidate-photographs.json'), read('data/records.json'), read('data/physical-references.json')];
}

test('13 unlinked records receive qualified DNG downloads without primary or work selection', () => {
  const args = fixture();
  const before = JSON.stringify(args.slice(1));
  const index = module.buildCandidatePhotographIndex(...args);
  assert.equal(Object.keys(index).length, 13);
  for (const [id, entry] of Object.entries(index)) {
    assert.equal(args[2].records[id].workId, '');
    assert.equal(args[2].records[id].mainImage, null);
    assert.match(entry.downloadUrl, /^https:\/\/huggingface\.co\/datasets\/maxwellinked\/time-lapse-artifacts\/resolve\/[a-f0-9]{40}\/Image_Source_Masters\/v1\/objects\/[a-f0-9]{64}\.DNG$/);
    assert.equal(Object.keys(entry).sort().join(','), 'associationBasis,downloadUrl,filename,qualification,sizeBytes,sourceMetadataUrl');
    assert.match(entry.qualification, /candidate/i);
    assert.match(entry.qualification, /endpoint/i);
    assert.ok(Object.isFrozen(entry));
  }
  assert.equal(JSON.stringify(args.slice(1)), before);
  assert.equal(module.getCandidatePhotographForRecord(index, 'unknown'), null);
});

test('Rec07 has group-derived evidence while the other 12 have direct cohort membership', () => {
  const index = module.buildCandidatePhotographIndex(...fixture());
  assert.match(index['tla-d9c74b9d57e1c3a7'].associationBasis, /group-derived/i);
  assert.equal(Object.values(index).filter(x => /direct cohort/i.test(x.associationBasis)).length, 12);
});

test('mixed revisions, unknown IDs, changed relationships and unsafe destinations fail closed', () => {
  const edits = [
    a => { a[0].sourceRevision = 'a'.repeat(40); },
    a => { a[1].sourceRevision = 'a'.repeat(40); },
    a => { a[2].sourceRevision = 'a'.repeat(40); },
    a => { a[0].photographs[0].relationshipStatus = 'confirmed'; },
    a => { a[0].photographs[0].studySetId = 'unknown_group'; },
    a => { a[0].photographs[0].workId = 'tlaw-0123456789abcdef'; },
    a => { a[0].photographs[0].endpointEstablished = true; },
    a => { a[0].photographs[0].sourcePath = 'https://example.com/stolen.DNG'; },
    a => { a[0].photographs[0].sourcePath = 'Image_Source_Masters/v1/objects/../x.DNG'; },
    a => { a[0].photographs[0].records[0].recordId = 'tla-0000000000000000'; },
    a => { a[0].photographs[0].records[0].associationBasis = 'owner-confirmed endpoint'; },
    a => { a[0].sourceInputs[0].sha256 = 'bad'; },
    a => { a[0].sourceInputs[0].retainedPath = '../outside.json'; },
    a => { a[2].records[a[0].photographs[0].records[0].recordId].workId = 'tlaw-0123456789abcdef'; },
  ];
  for (const edit of edits) { const args = fixture(); edit(args); assert.throws(() => module.buildCandidatePhotographIndex(...args)); }
});

test('loader accepts exact projection bytes and rejects hash mismatch or HTTP failure', async () => {
  const [, records, refs] = fixture();
  const bytes = fs.readFileSync(new URL('data/candidate-photographs.json', root));
  const fetcher = async url => { assert.match(url, /^data\/candidate-photographs.json\?v=[a-f0-9]{64}$/); return new Response(bytes); };
  const index = await module.loadCandidatePhotographIndex(records, refs, fetcher, webcrypto);
  assert.equal(Object.keys(index).length, 13);
  await assert.rejects(module.loadCandidatePhotographIndex(records, refs, async () => new Response(Buffer.concat([bytes, Buffer.from(' ')])), webcrypto), /hash mismatch/i);
  await assert.rejects(module.loadCandidatePhotographIndex(records, refs, async () => new Response('', { status: 503 }), webcrypto), /unavailable/i);
});

test('offline check reproduces exact source-derived projection', () => {
  fixture();
  const result = spawnSync('python', ['tools/build-candidate-photographs.py', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('generator rejects tampered retained bytes and changed source qualifications', () => {
  fixture();
  const code = `
import importlib.util, pathlib, tempfile, shutil, json
spec=importlib.util.spec_from_file_location('candidate_builder','tools/build-candidate-photographs.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manifest,found=m.inputs()
found['relationships.json']['endpoint_established']=True
try:m.build(manifest,found)
except ValueError as e:assert 'qualification' in str(e)
else:raise AssertionError('Changed source qualification accepted')
with tempfile.TemporaryDirectory() as tmp:
    copied=pathlib.Path(tmp)/'source';shutil.copytree(m.SOURCE,copied);m.SOURCE=copied
    path=copied/'relationships.json';path.write_bytes(path.read_bytes()+b' ')
    try:m.inputs()
    except ValueError as e:assert 'hash mismatch' in str(e)
    else:raise AssertionError('Tampered source bytes accepted')
`;
  const result = spawnSync('python', ['-c', code], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
