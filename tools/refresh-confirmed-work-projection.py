"""Bounded browser verification for the October 31 one-work/38-record release.

Historical blank-work additive refresh v1 remains a separate unchanged contract.
This module neither authors source metadata nor assigns work or photo identity.
"""
import copy
import argparse
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from collections import Counter

WORK = 'tlaw-d5e993f2657744f6'
CONFIRMATION_PATH = 'Work_Identity/Confirmations/2026-10-31-one-drawing-38-recordings.json'
CONFIRMATION_SHA256 = 'f76dceba7411edb6a4807700906ae2995b202ca986f46b8b0a3f7935b0bac3eb'
BROWSER_BASE = '996b00008ffc9bc502da8f0f8163fc38ee588b5d'
CURRENT_RECEIPT = 'data/confirmed-work-refresh.json'
ROOT = Path(__file__).resolve().parents[1]


def load(filename):
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_'), ROOT / 'tools' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R = load('refresh-additive-projection.py')
PHOTO = load('export-photo-selections.py')
M, LOOKUP, EVIDENCE = R.M, R.LOOKUP, R.EVIDENCE
OUTPUTS = frozenset({
    'data/records.json', 'data/physical-references.json', 'data/reference-link-evidence.json',
    'data/sequence-insertions.json', 'previews/manifest.json', 'reference-previews/manifest.json',
    'assets/visual-anchors/manifest.json', 'data/real-time-source/metadata.csv',
    'data/real-time-source/SHA256SUMS', 'data/real-time-source/manifest.json',
    'data/real-time-recordings.json', 'real-time-recordings.html', 'photograph-clarifications.html',
    PHOTO.MANIFEST, *PHOTO.PHOTO_OUTPUTS,
})


def require(ok, message):
    if not ok:
        raise ValueError(message)


def unique(rows, key, label):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), 'Duplicate ' + label)
    return result


def validate_release(before, after, confirmation_bytes, media_identities):
    """Verify published membership without reinterpreting older relationships."""
    require(hashlib.sha256(confirmation_bytes).hexdigest() == CONFIRMATION_SHA256,
            'Published confirmation hash differs from the approved release')
    confirmation = json.loads(confirmation_bytes)
    require(confirmation['work_id'] == WORK and confirmation['owner_described_work_count'] == 1,
            'Published confirmation describes another work')
    members = confirmation['members']
    require(len(members) == 38 and [r['sequence_position'] for r in members] == list(range(1, 39)),
            'Approved membership/order differs')
    expected = unique(members, 'record_id', 'confirmed member')
    require(len({r['file_path'] for r in members}) == 38 and
            all(re.fullmatch(r'VID_\d{8}_\d{6}\.mp4', r['source_original_filename']) for r in members),
            'Approved original membership differs')
    maps = {}
    for name, key in [('metadata', 'record_id'), ('works', 'work_id'), ('links', 'record_id')]:
        old = unique(before[name], key, name)
        current = unique(after[name], key, name)
        require(all(current.get(k) == row for k, row in old.items()) and
                after[name][:len(before[name])] == before[name],
                'Retained ' + name + ' rows/relationships changed')
        maps[name] = {k: row for k, row in current.items() if k not in old}
    require(set(maps['works']) == {WORK} and maps['works'][WORK]['status'] == 'active',
            'Release must add exactly one active confirmed work')
    evidence = maps['works'][WORK]['creation_evidence']
    require('confirmation_path=' + CONFIRMATION_PATH in evidence and
            'confirmation_sha256=' + CONFIRMATION_SHA256 in evidence,
            'New work creation evidence does not bind the approved confirmation')
    require(set(maps['metadata']) == set(maps['links']) == set(expected),
            'New recording/link membership differs from the exact 38 originals')
    for name in ['metadata', 'links']:
        require([r['record_id'] for r in after[name][len(before[name]):]] == list(expected),
                'Appended ' + name + ' order differs from confirmed capture order')
    for rid, member in expected.items():
        row, link = maps['metadata'][rid], maps['links'][rid]
        require(row['file_name'] == member['file_path'], 'Confirmed member path differs: ' + rid)
        require(row['work_id'] == link['work_id'] == WORK and
                link['owner_confirmation_state'] == 'owner_confirmed' and
                re.fullmatch('[a-f0-9]{40}', link.get('source_hub_revision', '')) is not None,
                'Invalid positive new link: ' + rid)
        require(not link.get('surface_scope') and not link.get('temporal_scope'),
                'New positive link acquired unsupported endpoint/surface scope')
        require(int(row['size_bytes']) == member['size_bytes'] and
                media_identities.get(member['file_path']) == (member['sha256'], member['size_bytes']),
                'Confirmed media identity differs: ' + rid)
    require(after['selections'] == before['selections'], 'Retained photograph selection changed')
    require(after['unselected_work_ids'] == before['unselected_work_ids'] + [WORK],
            'New work must remain explicitly unselected')
    require(after['photo_manifest_sha256'] == before['photo_manifest_sha256'],
            'Historical photograph manifest changed')
    return {'work_id': WORK, 'added_count': 38, 'added_records': [r['record_id'] for r in members]}


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True))


def retain_evidence(evidence, old_lookup, entries, prior_inputs, inputs, lookup, revision):
    # The corrected lookup intentionally retains historical qualified premises.
    # Reconstructing them from current rows would erase valid retained evidence.
    result = R.retain_qualified_evidence(evidence, old_lookup, entries, prior_inputs)
    result.update(sourceRevision=revision, lookupSha256=M.digest(lookup),
        sourceInputs={path: dict(**LOOKUP.text_binding(path, inputs[path]), revision=revision)
                      for path in EVIDENCE.SOURCES})
    return result


def prepare_template(path, text, revision, lookup_sha256):
    if path == 'assets/selected-fronts.js':
        text, count = re.subn(r'(LEGACY_REFERENCE_SHA256 = ")[a-f0-9]{64}(";)',
            lambda m: m[1] + lookup_sha256 + m[2], text)
        require(count == 1, 'Historical-reference hash gate missing')
    return M.migrate_cache_tokens(text, revision).replace('media-names-' + revision, 'confirmed-work-' + revision)


def validate_current_receipt(receipt, browser):
    require(receipt.get('schemaVersion') == 2 and receipt.get('contract') == 'confirmed_work_append_v1'
            and receipt.get('browserBase') == BROWSER_BASE and receipt.get('workId') == WORK
            and receipt.get('addedCount') == 38
            and re.fullmatch('[a-f0-9]{40}', receipt.get('sourceRevision', '')) is not None,
            'Invalid bounded current source receipt')
    require(set(receipt['outputs']) == OUTPUTS, 'Current projection output allowlist differs')
    require(receipt['confirmation']['path'] == CONFIRMATION_PATH
            and receipt['confirmation']['sha256'] == CONFIRMATION_SHA256,
            'Current receipt confirmation binding differs')
    historical = M.git_bytes(browser, BROWSER_BASE, 'data/source-refresh.json')
    require((browser / 'data/source-refresh.json').read_bytes() == historical
            and receipt['historicalAdditiveReceiptSha256'] == M.digest(historical),
            'Historical additive receipt changed')
    for relative, binding in receipt['outputs'].items():
        raw = (browser / relative).read_bytes()
        require(M.digest(raw) == binding['sha256'] and len(raw) == binding['sizeBytes'],
                'Current projection output identity differs: ' + relative)
    return True


def refresh(source, revision, browser, generated_at):
    """Return exact derived bytes; read only pinned Git objects and prior displays."""
    require(re.fullmatch('[a-f0-9]{40}', revision) is not None
            and re.fullmatch(r'\d{4}-\d{2}-\d{2}', generated_at) is not None,
            'Exact accepted source revision and explicit generation date required')
    old_bytes = lambda path: M.git_bytes(browser, BROWSER_BASE, path)
    source_bytes = lambda path: M.git_bytes(source, revision, path)
    old_refs = json.loads(old_bytes('data/physical-references.json'))
    old_records = json.loads(old_bytes('data/records.json'))
    old_registry = json.loads(old_bytes('data/source-photo-selections.json'))
    inputs = {path: source_bytes(path) for path in set(LOOKUP.SOURCES) | set(EVIDENCE.SOURCES) | set(PHOTO.SOURCE_PATHS)}
    registry = json.loads(inputs[PHOTO.REGISTRY])
    prior = {}
    for path in LOOKUP.SOURCES:
        binding = old_refs['sourceInputs'][path]
        raw = M.git_bytes(source, binding.get('revision', old_refs['sourceRevision']), path)
        require(M.digest(raw) == binding['sha256'] and len(raw) == binding['bytes'],
                'Historical source input no longer matches its binding: ' + path)
        prior[path] = raw
        if path not in {'metadata.csv', 'Work_Identity/works.csv', 'Work_Identity/work_record_links.csv'}:
            require(raw == inputs[path], 'Historical reference input changed: ' + path)
    confirmation = source_bytes(CONFIRMATION_PATH)
    member_list = json.loads(confirmation)['members']
    identities = {m['file_path']: M.object_identity(source_bytes(m['file_path'])) for m in member_list}
    sums = {}
    for line in source_bytes('SHA256SUMS').decode().splitlines():
        match = re.fullmatch(r'([a-f0-9]{64}) [ *](.+)', line)
        require(match and match[2] not in sums, 'Malformed/duplicate authoritative checksum')
        sums[match[2]] = match[1]
    require(all(sums.get(m['file_path']) == m['sha256'] for m in member_list),
            'Confirmed source media checksum differs')
    def authority(values, selection):
        return dict(metadata=rows(values['metadata.csv']), works=rows(values['Work_Identity/works.csv']),
            links=rows(values['Work_Identity/work_record_links.csv']), selections=selection['selections'],
            unselected_work_ids=selection.get('unselected_work_ids', []),
            photo_manifest_sha256=M.digest(values[LOOKUP.PHOTO_MANIFEST]))
    membership = validate_release(authority(prior, old_registry), authority(inputs, registry), confirmation, identities)
    records = R.project_records(inputs['metadata.csv'], revision, generated_at)
    old_by_id = {r['recordId']: r for r in old_records['records']}
    current = {r['recordId']: r for r in records['records']}
    require(set(current) - set(old_by_id) == set(membership['added_records']),
            'Browser addition population differs from the confirmed originals')
    for rid, entry in old_by_id.items():
        expected = copy.deepcopy(entry)
        for field in ['videoUrl', 'sourceUrl']:
            expected[field] = M.media_url(expected[field], {}, revision)
        require(current[rid] == expected, 'Retained recording projection changed: ' + rid)
    outputs = {'data/records.json': M.json_bytes(records)}
    outputs['data/sequence-insertions.json'] = R.project_sequence_insertions(source, revision, records)
    require(outputs['data/sequence-insertions.json'] is not None, 'Retained sequence registry missing')
    refs = copy.deepcopy(old_refs)
    # The original verifier checks retained correction receipts, actual photo
    # identities and old positive links. Its blank-new-work guard stays intact:
    # no additions are passed to it; the separately verified 38 are added below.
    retained_inputs = dict(inputs)
    for path in ['Work_Identity/works.csv', 'Work_Identity/work_record_links.csv']:
        retained_inputs[path] = prior[path]
    refs['records'], _ = R.retain_corrected_lookup(old_refs, retained_inputs,
        {r['record_id']: r for r in rows(inputs['metadata.csv'])}, set(old_by_id), [], revision, source_bytes)
    for rid in membership['added_records']:
        refs['records'][rid] = dict(workId=WORK, selectionStatus='missing_public_photo', referenceRole='missing',
            clarification='', referenceCount=0, primaryReferenceCount=0, mainImage=None, additionalReferences=[])
    refs.update(sourceRevision=revision,
        sourceInputs={p: dict(**LOOKUP.text_binding(p, inputs[p]), revision=revision) for p in LOOKUP.SOURCES},
        currentRecords=LOOKUP.text_binding('data/records.json', outputs['data/records.json']))
    values = list(refs['records'].values())
    refs['counts'] = dict(records=len(values), pairedRecords=sum(e['mainImage'] is not None for e in values),
        nullRecords=sum(e['mainImage'] is None for e in values),
        selectionStatuses=dict(Counter(e['selectionStatus'] for e in values)),
        referenceRoles=dict(Counter(e['referenceRole'] for e in values)))
    outputs['data/physical-references.json'] = LOOKUP.render_lookup(refs)
    old_evidence = json.loads(old_bytes('data/reference-link-evidence.json'))
    prior_evidence = {}
    for path in EVIDENCE.SOURCES:
        binding = old_evidence['sourceInputs'][path]
        prior_evidence[path] = M.git_bytes(source, binding.get('revision', old_evidence['sourceRevision']), path)
        if path not in {'Work_Identity/works.csv', 'Work_Identity/work_record_links.csv'}:
            require(prior_evidence[path] == inputs[path], 'Historical photograph premise changed: ' + path)
    evidence = retain_evidence(old_evidence, old_bytes('data/physical-references.json'), refs['records'],
        prior_evidence, inputs, outputs['data/physical-references.json'], revision)
    outputs['data/reference-link-evidence.json'] = M.json_bytes(evidence)
    preview = json.loads(old_bytes('previews/manifest.json'))
    preview.update(sourceRevision=revision, records=len(records['records']),
        recordIdentities={r['recordId']: r['integrityReference'] for r in records['records']})
    outputs['previews/manifest.json'] = M.json_bytes(preview)
    for path in ['reference-previews/manifest.json', 'assets/visual-anchors/manifest.json']:
        value = json.loads(old_bytes(path)); value['sourceRevision'] = revision
        for image in value.get('images', {}).values():
            for field in ['sourceUrl', 'sourcePath']:
                if image.get(field, '').startswith(M.BASE_URL + '/resolve/'):
                    image[field] = M.media_url(image[field], {}, revision)
        outputs[path] = M.json_bytes(value)
    previous_rt = {name: old_bytes('data/real-time-source/' + name)
                   for name in ['metadata.csv', 'SHA256SUMS', 'manifest.json']}
    rt_outputs, rt_receipt = R.prepare_real_time_refresh(previous_rt, source_bytes, records, 0)
    outputs.update(rt_outputs)
    bridge = """import {readFileSync} from 'node:fs';
const {buildClarificationPage}=await import(process.argv[2]);
const x=JSON.parse(readFileSync(process.argv[1],'utf8'));
process.stdout.write(buildClarificationPage(x.records,x.refs,x.evidence));"""
    with tempfile.TemporaryDirectory(prefix='confirmed-work-browser-') as folder:
        temp = Path(folder); source_files = temp / 'source'; target = temp / 'browser'
        for path in PHOTO.SOURCE_PATHS:
            file = source_files / path; file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(inputs[path])
        for path in PHOTO.TEMPLATES:
            text = prepare_template(path, (browser / path).read_text(encoding='utf-8'), revision,
                                    M.digest(outputs['data/physical-references.json']))
            file = target / path; file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text, encoding='utf-8', newline='\n')
        for selection in old_registry['selections']:
            relative = 'selected-fronts/' + selection['work_id'] + '.jpg'
            file = target / relative; file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(browser / relative, file)
        prior_selection = M.git_bytes(browser, PHOTO.BROWSER_BASE, 'data/selected-fronts.json')
        PHOTO.export(source_files, target, revision, prior_selection)
        for path in {*PHOTO.PHOTO_OUTPUTS, PHOTO.MANIFEST}:
            outputs[path] = (target / path).read_bytes()
        payload = temp / 'clarifications.json'
        payload.write_bytes(M.json_bytes(dict(records=records, refs=refs, evidence=evidence)))
        result = subprocess.run([shutil.which('node'), '--input-type=module', '--eval', bridge,
            str(payload), (ROOT / 'tools/build-photograph-clarifications.mjs').as_uri()], capture_output=True, check=True)
        outputs['photograph-clarifications.html'] = result.stdout
    require(set(outputs) == OUTPUTS, 'Current projection output allowlist differs')
    receipt = dict(schemaVersion=2, contract='confirmed_work_append_v1', sourceRepository=M.REPOSITORY,
        sourceRevision=revision, browserBase=BROWSER_BASE, generatedAt=generated_at, workId=WORK, addedCount=38,
        previousRecords=len(old_by_id), records=len(current), addedRecords=membership['added_records'],
        confirmation=dict(path=CONFIRMATION_PATH, sha256=CONFIRMATION_SHA256),
        historicalAdditiveReceiptSha256=M.digest(old_bytes('data/source-refresh.json')),
        historicalAdditiveScope='data/source-refresh.json describes the retained historical v1 release, not the current source pin.',
        preservedPhotographSelections=len(old_registry['selections']), unselectedWorkIds=registry['unselected_work_ids'],
        realTime=rt_receipt,
        sourceInputs={path: dict(sha256=M.digest(raw), bytes=len(raw)) for path, raw in sorted(inputs.items())},
        outputs={path: dict(sha256=M.digest(raw), sizeBytes=len(raw)) for path, raw in sorted(outputs.items())})
    outputs[CURRENT_RECEIPT] = M.json_bytes(receipt)
    return outputs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--source-revision', required=True)
    parser.add_argument('--browser-root', type=Path, default=ROOT)
    parser.add_argument('--generated-at', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = refresh(args.source_root, args.source_revision, args.browser_root, args.generated_at)
    for path, raw in outputs.items():
        target = args.output / path
        if args.check:
            require(target.read_bytes() == raw, 'Stale confirmed-work projection: ' + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    validate_current_receipt(json.loads(outputs[CURRENT_RECEIPT]), args.output)
    print(json.dumps(dict(status='checked' if args.check else 'prepared', files=len(outputs), publication='not_performed')))
