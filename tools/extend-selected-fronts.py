"""Reproduce the 435-work access projection from exact HF source inputs.

Retain 430 surviving candidate displays, retire the creator-superseded selection,
and derive five bounded master previews. Historical media/evidence pins remain
separate from the current, receipt-bound work-identity projection. No uploads.
"""
from pathlib import Path
import argparse
from collections import Counter
import copy
import csv
import hashlib
import io
import json
import re
import subprocess
from urllib.parse import unquote, urlsplit

import PIL
from PIL import Image, ImageCms, ImageOps, features

BASE_GITHUB = '26392f5c981f1d3207414f819c88ab8dbd8dc30f'
LAYER = 'Physical_References/Selected_Front_Downloads/'
CREATOR_NOTE = 'Work_Identity/Confirmations/2026-10-25-july-25-two-stages.md'
CREATOR_NOTE_SHA256 = '7f6826dd7ebbdd7a3eeac13a7b88b5aff7460b45828db48f0b3eaaa337b52d32'
CORRECTION_LEDGER = 'Work_Identity/index_identity_correction_2026-10-25-july-25.json'
REGISTRY_INPUTS = ('Work_Identity/works.csv', 'Work_Identity/work_record_links.csv')
SOURCE_INPUTS = (LAYER + 'downloads.json', LAYER + 'Confirmations/2026-10-25-five-master-fronts.json',
                 CREATOR_NOTE, CORRECTION_LEDGER, *REGISTRY_INPUTS, 'metadata.csv')
SURVIVOR, SUPERSEDED = 'tlaw-858a03eb138fbf47', 'tlaw-b03bbfba8babbf3d'
DONOR, AFFECTED = 'tla-109ffe803a4ae0b0', 'tla-933e757350798d34'
BASE_PROJECTION_SHA256 = '94b72b176dd807e80c89866b1cb7504c9136886ccbbb41a37f31141a21dff684'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, indent=2) + '\n').encode()


def preview(raw):
    # Profile creation dates are normalized so identical inputs produce exact bytes.
    profile = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
    profile[24:36] = bytes.fromhex('07d000010001000000000000')
    with Image.open(io.BytesIO(raw)) as original:
        original.load()
        icc = original.info.get('icc_profile')
        image = ImageOps.exif_transpose(original).convert('RGB')
        if icc:
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(icc)),
                                             ImageCms.ImageCmsProfile(io.BytesIO(profile)), outputMode='RGB')
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format='JPEG', quality=82, subsampling=2, optimize=False,
                   progressive=False, icc_profile=bytes(profile), exif=b'')
    result = out.getvalue()
    if not 0 < len(result) <= 524288:
        raise ValueError('Preview exceeds display byte limit')
    return result


def table(raw):
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline='')))


def render_preview_paths(shared):
    return ('// Generated exact-byte reuse map; source identities and output hashes remain in the preview manifest.\n'
            'export const SHARED_REFERENCE_PREVIEWS = Object.freeze(' + json.dumps(shared, indent=2) + ');\n'
            'export function referencePreviewPath(sourceSha) {\n'
            '  if (!/^[a-f0-9]{64}$/.test(sourceSha ?? "")) throw new Error("Invalid preview source hash");\n'
            '  const shared = SHARED_REFERENCE_PREVIEWS[sourceSha];\n'
            '  if (shared !== undefined && !/^selected-fronts\\/tlaw-[a-f0-9]{16}\\.jpg$/.test(shared)) throw new Error("Invalid shared preview path");\n'
            '  return shared ?? `reference-previews/${sourceSha}.jpg`;\n'
            '}\n').encode()


def build(source_root, destination, source_revision):
    if not re.fullmatch('[a-f0-9]{40}', source_revision):
        raise ValueError('Exact 40-character HF source revision required')
    def baseline(name):
        return subprocess.check_output(['git', 'show', f'{BASE_GITHUB}:{name}'], cwd=destination)
    inputs = {}
    bindings = {}
    for name in SOURCE_INPUTS:
        raw = (source_root / name).read_bytes()
        committed = subprocess.check_output(['git', 'cat-file', 'blob', f'{source_revision}:{name}'], cwd=source_root)
        if raw != committed:
            raise ValueError(f'Current source bytes differ from exact commit: {name}')
        inputs[name] = raw
        bindings[name] = {'revision': source_revision, 'sha256': digest(raw), 'bytes': len(raw)}
    if digest(inputs[CREATOR_NOTE]) != CREATOR_NOTE_SHA256:
        raise ValueError('Creator correction note differs from the reviewed statement')
    correction = json.loads(inputs[CORRECTION_LEDGER])
    if (correction['contract'] != 'owner_confirmed_work_identity_correction_v1' or
            correction['confirmation'] != {'path': CREATOR_NOTE, 'sha256': CREATOR_NOTE_SHA256, 'authority': 'creator_owner'} or
            correction['metadata_projection'] != [{'record_id': AFFECTED, 'field': 'work_id', 'before': SUPERSEDED, 'after': SURVIVOR}] or
            correction['selected_front']['donor_record_id'] != DONOR or
            correction['selected_front']['affected_record_id'] != AFFECTED or
            correction['selected_front']['survivor_work_id'] != SURVIVOR or
            correction['indexes']['metadata.csv']['after_sha256'] != digest(inputs['metadata.csv'])):
        raise ValueError('Correction ledger differs from the reviewed one-drawing transition')
    works = table(inputs[REGISTRY_INPUTS[0]])
    by_work = {row['work_id']: row for row in works}
    active = {work for work, row in by_work.items() if row['status'] == 'active'}
    if (len(by_work) != len(works) or len(active) != 435 or by_work[SURVIVOR]['status'] != 'active' or
            by_work[SUPERSEDED]['status'] != 'superseded' or by_work[SUPERSEDED]['superseded_by_work_id'] != SURVIVOR):
        raise ValueError('Current work registry differs from the reviewed supersession')
    links = table(inputs[REGISTRY_INPUTS[1]])
    by_record = {row['record_id']: row for row in links}
    if len(by_record) != len(links) or len(links) != 1256 or any(
            row['work_id'] not in active or row['owner_confirmation_state'] != 'owner_confirmed' for row in links):
        raise ValueError('Current recording links are incomplete, duplicated or nonpositive')
    base_raw = baseline('data/selected-fronts.json')
    if digest(base_raw) != BASE_PROJECTION_SHA256:
        raise ValueError('Retained 431-work projection changed')
    projection = json.loads(base_raw)
    historical_download_bytes = baseline('data/photograph-downloads.json')
    historical_downloads = json.loads(historical_download_bytes)
    downloads = json.loads(inputs[LAYER + 'downloads.json'])
    receipt = json.loads(inputs[LAYER + 'Confirmations/2026-10-25-five-master-fronts.json'])
    rows = downloads['rows']
    surviving_rows = [row for row in historical_downloads['rows'] if row['work_id'] != SUPERSEDED]
    if rows[:430] != surviving_rows or len(rows) != 435 or {row['work_id'] for row in rows} != active:
        raise ValueError('Surviving historical download rows changed or current coverage differs')
    if len({row['work_id'] for row in rows}) != len(rows) or len({row['sha256'] for row in rows}) != len(rows):
        raise ValueError('Duplicate active work or master bytes in download manifest')
    entries = receipt['entries']
    expected_works = set(projection['unselected_work_ids'])
    if len(entries) != 5 or {entry['work_id'] for entry in entries} != expected_works:
        raise ValueError('Receipt differs from explicitly unselected works')
    refs_raw = baseline('data/physical-references.json')
    refs = json.loads(refs_raw)
    record_bytes = baseline('data/records.json')
    records = json.loads(record_bytes)
    canonical = table(inputs['metadata.csv'])
    if (len(canonical) != len(records['records']) or len(canonical) != 1256 or
            set(by_record) != set(refs['records'])):
        raise ValueError('Canonical and historical recording populations differ')
    changed = []
    for record in records['records']:
        rid = record['recordId']; source = canonical[record['rowIndex']]
        if (source['record_id'] != rid or source['hub_xet_hash'] != record['integrityReference'] or
                not unquote(urlsplit(record['sourceUrl']).path).endswith('/' + source['file_name']) or
                source['work_id'] != by_record[rid]['work_id']):
            raise ValueError(f'Canonical recording identity or projection differs: {rid}')
        if refs['records'][rid]['workId'] != by_record[rid]['work_id']:
            changed.append(rid)
    if changed != [AFFECTED] or refs['records'][DONOR]['workId'] != SURVIVOR:
        raise ValueError('More than the creator-confirmed recording work join changed')
    refs['records'][AFFECTED] = copy.deepcopy(refs['records'][DONOR])
    correction_binding = {'repository': 'maxwellinked/time-lapse-artifacts', 'revision': source_revision,
        'base_github_revision': BASE_GITHUB, 'base_lookup_sha256': digest(refs_raw),
        'ledger': {'path': CORRECTION_LEDGER, **bindings[CORRECTION_LEDGER]},
        'confirmation': {'path': CREATOR_NOTE, **bindings[CREATOR_NOTE]},
        'superseded_work_id': SUPERSEDED, 'survivor_work_id': SURVIVOR,
        'donor_record_id': DONOR, 'affected_record_id': AFFECTED}
    refs['historicalSourceInputs'] = copy.deepcopy(refs['sourceInputs'])
    for path, binding in refs['sourceInputs'].items():
        binding['revision'] = refs['sourceRevision']
    for path in REGISTRY_INPUTS:
        raw = inputs[path]
        refs['sourceInputs'][path] = {'path': path, **bindings[path], 'gitBlobOid': hashlib.sha1(
            b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}
    refs['workIdentityCorrection'] = correction_binding
    refs['currentRecords'] = {'path': 'data/records.json', 'sha256': digest(record_bytes), 'bytes': len(record_bytes)}
    values = list(refs['records'].values())
    refs['counts'] = {'records': len(values), 'pairedRecords': sum(item['mainImage'] is not None for item in values),
        'nullRecords': sum(item['mainImage'] is None for item in values),
        'selectionStatuses': dict(Counter(item['selectionStatus'] for item in values)),
        'referenceRoles': dict(Counter(item['referenceRole'] for item in values))}
    projection['selections'] = [row for row in projection['selections'] if row['work_id'] != SUPERSEDED]
    if len(projection['selections']) != 430:
        raise ValueError('Surviving baseline selection count differs')
    for item in projection['selections']:
        raw = (destination / 'selected-fronts' / (item['work_id'] + '.jpg')).read_bytes()
        if digest(raw) != item['display']['output_display_sha256']:
            raise ValueError(f'Surviving display bytes changed: {item["work_id"]}')
    projection['recording_links'] = {'repository': 'main', 'revision': source_revision,
        'path': REGISTRY_INPUTS[1], 'sha256': digest(inputs[REGISTRY_INPUTS[1]])}
    projection['work_identity_correction'] = correction_binding
    outputs = {}
    old_hashes = {item['display']['output_display_sha256'] for item in projection['selections']}
    for entry in entries:
        work = entry['work_id']
        row = next(row for row in rows[430:] if row['work_id'] == work)
        if (entry['source_photograph_sha256'] != row['source_sha256'] or
                entry['rendered_master_path'] != row['path'] or
                entry['rendered_master_sha256'] != row['sha256'] or
                entry['rendered_master_bytes'] != row['size_bytes'] or
                entry['display_dimensions_px'] != [row['width_px'], row['height_px']] or
                row['display_sha256'] is not None or
                row['media_revision'] != receipt['release_media_ref'] or
                [entry[k] for k in ('relationship_status', 'evidence_class', 'authority_class', 'derivation_method')] !=
                ['owner_confirmed', 'direct_owner_confirmed', 'owner_direct', 'direct_confirmation']):
            raise ValueError(f'Master row differs from owner receipt: {work}')
        linked = {record for record, item in refs['records'].items() if item['workId'] == work}
        if linked != set(entry['record_ids']) or len(entry['record_ids']) != len(linked):
            raise ValueError(f'Owner receipt differs from retained recording memberships: {work}')
        raw = (source_root / row['path']).read_bytes()
        if len(raw) != row['size_bytes'] or digest(raw) != row['sha256']:
            raise ValueError(f'Master byte identity differs: {work}')
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'JPEG' or list(ImageOps.exif_transpose(image).size) != entry['display_dimensions_px']:
                raise ValueError(f'Master format or orientation differs: {work}')
        display = preview(raw)
        display_hash = digest(display)
        if display_hash in old_hashes:
            raise ValueError(f'Duplicate display JPEG: {work}')
        old_hashes.add(display_hash)
        outputs[f'selected-fronts/{work}.jpg'] = display
        projection['selections'].append({
            'work_id': work, 'source_photograph_sha256': row['source_sha256'], 'photo_role': 'front',
            'display': {'output_display_sha256': display_hash},
        })
        # Resolve the published version ref to the exact released commit in this access projection.
        row['media_revision'] = source_revision
    projection['unselected_work_ids'] = []
    projection['master_front_supplement'] = {
        'repository': 'maxwellinked/time-lapse-artifacts', 'revision': source_revision,
        'base_github_revision': BASE_GITHUB, 'base_projection_sha256': BASE_PROJECTION_SHA256,
        'baseline_selection_count': 431, 'surviving_baseline_selection_count': 430, 'supplement_selection_count': 5,
        'inputs': {name: bindings[name] for name in SOURCE_INPUTS},
        'processing': {'pillow_version': PIL.__version__, 'jpeg_version': features.version('jpg'),
                       'littlecms_version': features.version('littlecms2'), 'exif_orientation': 'applied_once_and_removed',
                       'color_space': 'sRGB', 'long_edge_pixels': 1024, 'resize': 'LANCZOS_no_upscale',
                       'jpeg_quality': 82, 'jpeg_subsampling': 2, 'crop': False, 'enhancement': False},
    }
    downloads['source_index'] = {'repository': 'maxwellinked/time-lapse-artifacts', 'revision': source_revision,
        'path': LAYER + 'downloads.json', 'sha256': digest(inputs[LAYER + 'downloads.json']),
        'resolved_media_refs': {receipt['release_media_ref']: source_revision}}
    refs_output = (json.dumps(refs, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    outputs['data/physical-references.json'] = refs_output
    evidence = json.loads(baseline('data/reference-link-evidence.json'))
    evidence['lookupSha256'] = digest(refs_output)
    for name in REGISTRY_INPUTS:
        evidence['sourceInputs'][name] = bindings[name]
    evidence['workIdentityCorrection'] = correction_binding
    outputs['data/reference-link-evidence.json'] = (json.dumps(evidence, indent=2, ensure_ascii=False) + '\n').encode()
    previews = json.loads(baseline('reference-previews/manifest.json'))
    used = {photo['sha256'] for entry in refs['records'].values() for photo in [entry['mainImage']] if photo}
    retired_sources = [sha for sha in previews['images'] if sha not in used]
    previews['images'] = {sha: item for sha, item in previews['images'].items() if sha in used}
    previews['workIdentityCorrection'] = correction_binding
    selected_by_hash = {item['display']['output_display_sha256']: item['work_id'] for item in projection['selections']}
    shared = {}
    for source_hash, item in previews['images'].items():
        work = selected_by_hash.get(item['sha256'])
        if work:
            path = f'selected-fronts/{work}.jpg'
            raw = (destination / path).read_bytes()
            original = baseline(f'reference-previews/{source_hash}.jpg')
            if raw != original or digest(raw) != item['sha256']:
                raise ValueError(f'Shared preview bytes differ: {source_hash}')
            item['assetPath'] = path
            shared[source_hash] = path
    outputs['reference-previews/manifest.json'] = encode(previews)
    outputs['assets/reference-preview-paths.js'] = render_preview_paths(shared)
    anchors = json.loads(baseline('assets/visual-anchors/manifest.json'))
    for source_hash, item in anchors['images'].items():
        if source_hash in shared:
            item['sourcePath'] = shared[source_hash]
    outputs['assets/visual-anchors/manifest.json'] = encode(anchors)
    outputs['data/selected-fronts.json'] = encode(projection)
    download_bytes = encode(downloads)
    if b'\r\n' in historical_download_bytes:
        download_bytes = download_bytes.replace(b'\n', b'\r\n')
    outputs['data/photograph-downloads.json'] = download_bytes
    retired = [f'selected-fronts/{SUPERSEDED}.jpg'] + [f'reference-previews/{sha}.jpg' for sha in retired_sources + list(shared)]
    for name in retired:
        target = destination / name
        if target.exists() and target.read_bytes() != baseline(name):
            raise ValueError(f'Retired asset differs from the preserved Git baseline: {name}')
    return outputs, retired


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True, help='Root containing the published HF input paths')
    parser.add_argument('--source-revision', required=True, help='Exact full HF commit containing the corrected current inputs')
    parser.add_argument('--destination', type=Path, default=Path('.'))
    parser.add_argument('--check', action='store_true', help='Compare all generated bytes without writing')
    args = parser.parse_args()
    outputs, retired = build(args.source_root.resolve(), args.destination.resolve(), args.source_revision)
    for name, raw in outputs.items():
        target = args.destination / name
        if args.check:
            if not target.exists() or target.read_bytes() != raw:
                raise ValueError(f'Generated bytes differ: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
    for name in retired:
        target = args.destination / name
        if args.check:
            if target.exists():
                raise ValueError(f'Superseded current asset remains: {name}')
        else:
            target.unlink(missing_ok=True)
    print(json.dumps({'selected_works': 435, 'added_previews': 5, 'retired_assets': retired, 'preview_bytes': sum(
        len(raw) for name, raw in outputs.items() if name.endswith('.jpg')),
        'projection_sha256': digest(outputs['data/selected-fronts.json']),
        'reference_lookup_sha256': digest(outputs['data/physical-references.json']),
        'downloads_sha256': digest(outputs['data/photograph-downloads.json']), 'check': args.check}, indent=2))
