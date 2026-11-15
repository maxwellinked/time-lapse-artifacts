"""Project published work-level reference photographs without selecting primary fronts.

Normal builds and --check replay historical browser inputs with local Git and
verify their current memberships. --generate-previews reads public JPEGs from
--image-root or the revision-pinned Hub URL. HF_SOURCE_ROOT additionally checks
the retained metadata against its exact published source revision.
"""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/reviewed-photo-source'
OUTPUT = ROOT / 'data/reviewed-photographs.json'
LINKS = 'Work_Identity/work_record_links.csv'
REPOSITORY = 'maxwellinked/time-lapse-artifacts'
SOURCE_REVISION = '202226b18431f67f879629d8f49d72883643f810'
BROWSER_BASE = '95ad8b8717cd641e4a21fb2c517afe6a47724f2f'
CLASSES = {
    'owner_confirmed_work_photo_association',
    'creator_supplied_matching_finish_label_and_visual_corroboration',
}
QUALIFICATION = ('Published work-level reference photograph. Equality with an exact recording endpoint '
                 'is not established; this photograph has not been promoted to the selected primary front.')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def serialized(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_relative(path):
    require(isinstance(path, str) and not path.startswith('/') and
            all(re.fullmatch(r'[A-Za-z0-9_.-]+', part) and part not in ('.', '..') for part in path.split('/')),
            'Unsafe source path')
    return path


def inputs():
    manifest = json.loads((SOURCE / 'sources.json').read_bytes())
    require(manifest['sourceRepository'] == REPOSITORY and manifest['sourceRevision'] == SOURCE_REVISION, 'Source snapshot')
    found = {}
    for entry in manifest['inputs']:
        data = (ROOT / safe_relative(entry['retainedPath'])).read_bytes()
        require(len(data) == entry['sizeBytes'] and digest(data) == entry['sha256'], 'Retained source hash mismatch')
        require(entry['path'] not in found, 'Duplicate source input')
        if os.environ.get('HF_SOURCE_ROOT'):
            actual = subprocess.check_output(['git', '-C', os.environ['HF_SOURCE_ROOT'], 'show', manifest['sourceRevision'] + ':' + entry['path']])
            require(actual == data, 'Retained source differs from pinned Hugging Face revision')
        found[entry['path']] = (entry, data)
    require(LINKS in found, 'Missing work links')
    return manifest, found


def associations(found):
    result = []
    for path, (_, data) in sorted(found.items()):
        if path == LINKS:
            continue
        require(re.fullmatch(r'Physical_References/Reviewed_Photographs/\d{4}-\d{2}-\d{2}/metadata/photographs.json', path), 'Unexpected source metadata')
        collection = json.loads(data)
        require(collection['schema_version'] == 'reviewed_photograph_access_collection_v1', 'Unknown source schema')
        for photo in collection['photographs']:
            for association in photo.get('work_associations', []):
                require(association['evidence_class'] in CLASSES, 'Unknown evidence class')
                require(photo['selected_front_promoted'] is False and association['selected_front_promoted'] is False and
                        association['endpoint_equality'] is None and association['photographed_final_state'] is None,
                        'Changed source qualification requires review')
                require(association['recording_membership_registry'] == LINKS and re.fullmatch(r'tlaw-[a-f0-9]{16}', association['work_id']), 'Work association')
                require(re.fullmatch(r'images/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.jpg', photo['image']['path']), 'Image path')
                image_path = path.rsplit('/metadata/', 1)[0] + '/' + photo['image']['path']
                result.append((path, image_path, photo, association))
    require(len({a[3]['work_id'] for a in result}) == len(result), 'Ambiguous duplicate work photographs')
    return sorted(result, key=lambda a: a[3]['work_id'])


def create_previews(manifest, found, image_root):
    from PIL import Image, ImageOps, __version__ as pillow_version
    receipts = []
    for _, image_path, photo, association in associations(found):
        local = Path(image_root) / image_path if image_root else None
        if local and local.is_file():
            original = local.read_bytes()
        else:
            url = f'https://huggingface.co/datasets/{REPOSITORY}/resolve/{manifest["sourceRevision"]}/{image_path}'
            with urllib.request.urlopen(url, timeout=120) as response:
                original = response.read()
        expected = photo['image']
        require(len(original) == expected['size_bytes'] and digest(original) == expected['sha256'], 'Public JPEG hash mismatch')
        with Image.open(io.BytesIO(original)) as source:
            require(list(source.size) == expected['encoded_dimensions_px'] and source.getexif().get(274, 1) == expected['orientation'], 'Source JPEG dimensions/orientation mismatch')
            image = ImageOps.exif_transpose(source).convert('RGB')
            require(list(image.size) == expected['display_dimensions_px'], 'Display orientation mismatch')
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            target = f'reviewed-photographs/{association["work_id"]}.jpg'
            (ROOT / target).parent.mkdir(exist_ok=True)
            image.save(ROOT / target, format='JPEG', quality=84, subsampling=2, optimize=True,
                       icc_profile=source.info.get('icc_profile'))
            encoded = (ROOT / target).read_bytes()
            receipts.append({'workId': association['work_id'], 'sourcePath': image_path,
                             'sourceSha256': digest(original), 'sourceSizeBytes': len(original),
                             'displayPath': target, 'displaySha256': digest(encoded),
                             'displaySizeBytes': len(encoded), 'width': image.width, 'height': image.height,
                             'orientationNormalized': True})
    (SOURCE / 'preview-receipts.json').write_bytes(serialized({'schemaVersion': 1,
        'sourceRevision': manifest['sourceRevision'], 'method': 'EXIF transpose; fit within 1024 pixels; JPEG quality 84, subsampling 2, optimized; retain ICC',
        'pillowVersion': pillow_version, 'previews': receipts}))


def browser_inputs(revision=None):
    paths = ('data/records.json', 'data/physical-references.json')
    return tuple(json.loads(
        subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{revision}:{path}'])
        if revision else (ROOT / path).read_bytes()
    ) for path in paths)


def index_browser_memberships(projections):
    records, references = projections
    revision = records['sourceRevision']
    require(records['sourceRepository'] == references['sourceRepository'] == REPOSITORY and
            re.fullmatch(r'[a-f0-9]{40}', revision) and references['sourceRevision'] == revision,
            'Browser source revision mismatch')
    work_links = references['sourceInputs'].get(LINKS, {})
    require(work_links.get('path') == LINKS and work_links.get('revision') == revision and
            re.fullmatch(r'[a-f0-9]{64}', work_links.get('sha256', '')), 'Browser work-link binding mismatch')
    by_id = {r['recordId']: r for r in records['records']}
    require(len(by_id) == len(records['records']), 'Duplicate browser recording ID')
    by_work = {}
    for rid in by_id:
        work = references['records'].get(rid, {}).get('workId')
        if work:
            by_work.setdefault(work, set()).add(rid)
    return revision, work_links, by_id, by_work


def build(manifest, found, historical):
    from PIL import Image
    revision, work_links, _, by_work = index_browser_memberships(historical)
    require(revision == manifest['sourceRevision'] == SOURCE_REVISION, 'Historical browser source revision mismatch')
    require(found[LINKS][0]['sha256'] == work_links['sha256'], 'Historical browser work-link hash mismatch')
    memberships = list(csv.DictReader(io.StringIO(found[LINKS][1].decode('utf-8-sig'))))
    receipts = json.loads((SOURCE / 'preview-receipts.json').read_bytes())
    require(receipts['sourceRevision'] == revision, 'Preview source revision mismatch')
    preview_map = {p['workId']: p for p in receipts['previews']}
    require(len(preview_map) == len(receipts['previews']), 'Duplicate preview receipt')
    photographs = []
    for metadata_path, image_path, photo, association in associations(found):
        work = association['work_id']
        linked = sorted(r['record_id'] for r in memberships if r['work_id'] == work)
        require(len(linked) == len(set(linked)) == association['recording_count'], 'Published membership count mismatch')
        require(set(linked) == by_work.get(work), 'Historical browser work membership mismatch')
        preview = preview_map[work]
        require(preview['sourcePath'] == image_path and preview['sourceSha256'] == photo['image']['sha256'] and
                preview['sourceSizeBytes'] == photo['image']['size_bytes'], 'Source JPEG receipt mismatch')
        require(preview['displayPath'] == f'reviewed-photographs/{work}.jpg' and preview['orientationNormalized'] is True, 'Preview path or orientation')
        data = (ROOT / preview['displayPath']).read_bytes()
        require(digest(data) == preview['displaySha256'] and len(data) == preview['displaySizeBytes'], 'Preview hash mismatch')
        with Image.open(io.BytesIO(data)) as image:
            require(image.size == (preview['width'], preview['height']) and max(image.size) <= 1024 and
                    image.getexif().get(274, 1) == 1, 'Preview dimensions/orientation')
        base = f'https://huggingface.co/datasets/{REPOSITORY}'
        photographs.append({'workId': work, 'imagePath': image_path,
            'sourceImageSha256': photo['image']['sha256'], 'sourceImageSizeBytes': photo['image']['size_bytes'],
            'displayUrl': preview['displayPath'], 'displaySha256': preview['displaySha256'],
            'displaySizeBytes': preview['displaySizeBytes'], 'previewDimensions': [preview['width'], preview['height']],
            'fullResolutionUrl': f'{base}/resolve/{revision}/{image_path}',
            'displayDimensions': ' × '.join(str(v) for v in photo['image']['display_dimensions_px']),
            'evidenceClass': association['evidence_class'], 'evidenceBasis': association['evidence_basis'],
            'sourceMetadataUrl': f'{base}/blob/{revision}/{metadata_path}', 'metadataPath': metadata_path,
            'endpointEquality': association['endpoint_equality'], 'photographedFinalState': association['photographed_final_state'],
            'selectedFrontPromoted': association['selected_front_promoted'], 'qualification': QUALIFICATION, 'recordIds': linked})
    require(set(preview_map) == {p['workId'] for p in photographs}, 'Unexpected preview receipt')
    return {'schemaVersion': 1, 'sourceRepository': REPOSITORY, 'sourceRevision': revision,
            'sourceInputs': manifest['inputs'], 'recordingLinks': found[LINKS][0], 'photographs': photographs}


def check_current_memberships(projection, historical, current):
    _, _, legacy_by_id, _ = index_browser_memberships(historical)
    revision, work_links, by_id, by_work = index_browser_memberships(current)
    if revision == projection['sourceRevision']:
        require(work_links['sha256'] == projection['recordingLinks']['sha256'], 'Historical work-link hash mismatch')
    integrity = {}
    for photo in projection['photographs']:
        require(set(photo['recordIds']) == by_work.get(photo['workId']), 'Current browser work membership mismatch')
        for rid in photo['recordIds']:
            old, record = legacy_by_id[rid], by_id[rid]
            expected = old['integrityReference']
            require(re.fullmatch(r'[a-f0-9]{64}', expected) and record.get('integrityReference') == expected,
                    'Reviewed recording integrity differs: ' + rid)
            url = f'https://huggingface.co/datasets/{REPOSITORY}/resolve/{revision}/Standard_Time_Lapses/{old["filename"]}'
            require(record['filename'] == old['filename'] and record['videoUrl'] == url,
                    'Reviewed recording path differs: ' + rid)
            integrity[rid] = expected
    return integrity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--generate-previews', action='store_true')
    parser.add_argument('--image-root', type=Path)
    args = parser.parse_args()
    require(not (args.check and args.generate_previews), 'Check mode is read-only')
    manifest, found = inputs()
    if args.generate_previews:
        create_previews(manifest, found, args.image_root)
    historical = browser_inputs(BROWSER_BASE)
    projection = build(manifest, found, historical)
    integrity = check_current_memberships(projection, historical, browser_inputs())
    integrity_block = 'const RECORDING_INTEGRITY = Object.freeze(' + json.dumps(integrity, indent=2, sort_keys=True) + ');'
    data = serialized(projection)
    module = ROOT / 'assets/reviewed-photographs.js'
    expected_hash = digest(data)
    text = module.read_text(encoding='utf-8')
    link_hash = projection['recordingLinks']['sha256']
    require(f'HISTORICAL_WORK_LINK_SHA256 = "{link_hash}"' in text, 'Runtime historical work-link hash is stale')
    if args.check:
        require(OUTPUT.read_bytes() == data, 'Reviewed photo projection is stale')
        require(f'REVIEWED_PHOTOGRAPHS_SHA256 = "{expected_hash}"' in text, 'Runtime projection hash is stale')
        require(integrity_block in text, 'Runtime recording integrity bindings are stale')
    else:
        text, replacements = re.subn(r'REVIEWED_PHOTOGRAPHS_SHA256 = "[a-f0-9]{64}"',
                                     f'REVIEWED_PHOTOGRAPHS_SHA256 = "{expected_hash}"', text)
        require(replacements == 1, 'Runtime projection hash constant missing')
        text, replacements = re.subn(r'const RECORDING_INTEGRITY = Object\.freeze\(\{[^}]*\}\);', integrity_block, text)
        require(replacements == 1, 'Missing runtime recording integrity bindings')
        OUTPUT.write_bytes(data)
        module.write_text(text, encoding='utf-8', newline='\n')
    print(f'Reviewed photographs: {len(projection["photographs"])} works; {sum(len(p["recordIds"]) for p in projection["photographs"])} recordings; exact sources/previews/projection verified')


if __name__ == '__main__':
    main()
