"""Reproduce qualified DNG access links from retained, published source receipts.

Build and --check are offline. HF_SOURCE_ROOT additionally compares retained
inputs to git show at the exact source revision. No images are derived, selected,
or published and no canonical work identities are assigned by this projection.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/candidate-photo-source'
OUTPUT = ROOT / 'data/candidate-photographs.json'
REVISION = '202226b18431f67f879629d8f49d72883643f810'
REPOSITORY = 'maxwellinked/time-lapse-artifacts'
MANIFEST_SHA256 = '8bb79930d2e0280b9d8151977644dbcac1770c79a479e09af9f539a354937865'
QUALIFICATION = ('Published candidate reference photograph for this recording group. '
                 'It does not establish an exact recording endpoint or final state, '
                 'and is not a selected primary photograph. DNG source download; no browser image is supplied.')
DIRECT = 'Direct cohort membership; candidate photograph relationship retained.'
DERIVED = 'Group-derived from prior owner-confirmed recording membership; not individually listed in the later study cohort.'
PATHS = {
    'relationships.json': 'Image_Source_Masters/v1/Receipts/relationships.json',
    'ingest-authority.json': 'Image_Source_Masters/v1/Receipts/ingest-authority.json',
    'cohort.json': 'Standard_Time_Lapses/Provenance/2026-10-30/cohort.json',
    'owner-confirmation.json': 'Standard_Time_Lapses/Provenance/2026-10-29/owner_confirmation.json',
    'ingest-mapping.json': 'Standard_Time_Lapses/Provenance/2026-10-29/ingest_mapping.json',
    'source-dispositions.json': 'Standard_Time_Lapses/Provenance/2026-10-29/source_dispositions.json',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def serialized(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def inputs():
    raw = (SOURCE / 'sources.json').read_bytes()
    require(digest(raw) == MANIFEST_SHA256, 'Retained source manifest hash mismatch')
    manifest = json.loads(raw)
    require(manifest['sourceRepository'] == REPOSITORY and manifest['sourceRevision'] == REVISION, 'Source revision mismatch')
    require(len(manifest['inputs']) == len(PATHS), 'Source input count differs')
    found = {}
    for entry in manifest['inputs']:
        names = [name for name, path in PATHS.items() if path == entry['path']]
        require(len(names) == 1 and entry['retainedPath'] == 'data/candidate-photo-source/' + names[0], 'Unexpected retained input path')
        name = names[0]
        require(name not in found, 'Duplicate source input')
        data = (SOURCE / name).read_bytes()
        require(len(data) == entry['sizeBytes'] and digest(data) == entry['sha256'], 'Retained source hash mismatch: ' + name)
        if os.environ.get('HF_SOURCE_ROOT'):
            pinned = subprocess.check_output(['git', '-C', os.environ['HF_SOURCE_ROOT'], 'show', REVISION + ':' + entry['path']])
            require(data == pinned, 'Retained input differs from pinned Hugging Face bytes: ' + name)
        found[name] = json.loads(data)
    return manifest, found


def build(manifest, found):
    records = json.loads((ROOT / 'data/records.json').read_bytes())
    refs = json.loads((ROOT / 'data/physical-references.json').read_bytes())
    require(records['sourceRepository'] == refs['sourceRepository'] == REPOSITORY and
            records['sourceRevision'] == refs['sourceRevision'] == REVISION, 'Browser source revision mismatch')
    by_id = {r['recordId']: r for r in records['records']}
    require(len(by_id) == len(records['records']), 'Duplicate browser record')
    relationship = found['relationships.json']
    authority = found['ingest-authority.json']
    cohort = found['cohort.json']
    owner = found['owner-confirmation.json']
    mapping = found['ingest-mapping.json']
    dispositions = found['source-dispositions.json']
    require(relationship['schema_version'] == 'image-source-master-relationships/v1' and
            relationship['scope'] == 'study_set_static_reference_candidate_only' and
            relationship['investigation_status'] == 'open', 'Changed source relationship scope')
    require(all(relationship[k] is False for k in ('work_identity_established', 'endpoint_established', 'final_state_established', 'calibrated_registration_established')), 'Changed source qualification')
    require(authority['schema_version'] == 'image-source-master-ingest-authority/v1' and
            authority['work_registration_authorized'] is False and authority['primary_selection_authorized'] is False and
            cohort['work_registration'] is False, 'Changed source authority')
    require(owner['status_at_generation'] == 'owner_approved_publication_remote_index_bound' and
            mapping['schema'] == 'approved-ordinary-ingest-mapping/v1', 'Owner group authority missing')
    assets = {a['asset_id']: a for a in authority['objects']}
    require(len(assets) == len(relationship['objects']) == 2, 'Unexpected candidate asset population')
    photographs = []
    assigned = set()
    for rel in sorted(relationship['objects'], key=lambda r: r['asset_id']):
        require(rel['relationship_status'] == 'candidate_same_drawing' and rel['asset_id'] in assets, 'Changed candidate status or unknown asset')
        a = assets[rel['asset_id']]
        require(a['sha256'] == rel['sha256'] and a['asset_id'] == 'imsrc:sha256:' + a['sha256'] and
                a['study_set_id'] == rel['study_set_id'] and a['file_name'] == 'Image_Source_Masters/v1/objects/' + a['sha256'] + '.DNG', 'Candidate source identity mismatch')
        raw_rows = [r for r in cohort['source_rows'] if r['asset_id'] == a['asset_id'] and r['role'] == 'raw_static_master']
        require(len(raw_rows) == 1, 'Candidate has no unique cohort source')
        raw_row = raw_rows[0]
        require(raw_row['source_sha256'] == a['sha256'] and raw_row['destination'] == a['file_name'] and
                raw_row['size_bytes'] == a['size_bytes'] and raw_row['work_id'] == '', 'Cohort source differs')
        direct_rows = [r for r in cohort['source_rows'] if r['role'] == 'time_lapse' and r['group'] == raw_row['group']]
        linked = {}
        for row in direct_rows:
            require(row['work_id'] == '' and row['owner_finish_date'] == a['owner_finish_date'] and row['owner_finish_HHMM'] == a['owner_finish_time'], 'Unknown cohort group')
            rid = row['record_id']
            if rid in linked:
                require(linked[rid]['canonicalPath'] == row['destination'], 'Conflicting cohort aliases')
            linked[rid] = {'recordId': rid, 'canonicalPath': row['destination'], 'associationBasis': DIRECT, 'associationKind': 'direct_cohort'}
        # Join older membership by intersecting already recorded IDs, never by a
        # similar filename/date/image. This supplies only the prior final Rec07.
        overlapping = [r for r in dispositions['rows'] if r['record_id'] in linked]
        keys = {r['group_key'] for r in overlapping}
        require(len(keys) <= 1, 'Cohort crosses owner-confirmed recording groups')
        for key in keys:
            group = next(g for g in mapping['groups'] if g['group_key'] == key)
            confirmed = [g for g in owner['labels'] if g['owner_group_letter'] == key and g['normalized_owner_label'] == group['owner_label']]
            require(len(confirmed) == 1 and group['work_id'] == '' and group['documented_finish_date'] == a['owner_finish_date'] and
                    group['documented_finish_time'] == a['owner_finish_time'], 'Owner group context mismatch')
            older = [r for r in dispositions['rows'] if r['group_key'] == key and r['selection_status'] == 'accepted']
            require(len(older) == group['accepted_source_count'] and
                    {r['original_filename'] for r in older} == set(group['accepted_sources_in_order']), 'Owner group source population mismatch')
            for row in older:
                require(row['owner_label'] == group['owner_label'] and row['work_id'] == '', 'Older membership changed')
                if row['record_id'] not in linked:
                    linked[row['record_id']] = {'recordId': row['record_id'], 'canonicalPath': row['canonical_path'], 'associationBasis': DERIVED, 'associationKind': 'owner_group_derived'}
        for rid, row in linked.items():
            require(rid not in assigned and rid in by_id and refs['records'][rid]['workId'] == '' and
                    refs['records'][rid]['selectionStatus'] == 'missing_work_link' and refs['records'][rid]['mainImage'] is None, 'Candidate record unknown, duplicated or linked to a work')
            expected_url = f'https://huggingface.co/datasets/{REPOSITORY}/resolve/{REVISION}/{row["canonicalPath"]}'
            require(by_id[rid]['videoUrl'] == expected_url and by_id[rid]['filename'] == row['canonicalPath'].rsplit('/', 1)[1], 'Candidate browser recording path differs')
            row['filename'] = by_id[rid]['filename']
            assigned.add(rid)
        photographs.append({'assetId': a['asset_id'], 'sourceSha256': a['sha256'], 'sourcePath': a['file_name'],
            'filename': a['original_filename'], 'sizeBytes': a['size_bytes'], 'studySetId': a['study_set_id'],
            'workId': None, 'relationshipStatus': rel['relationship_status'], 'endpointEstablished': False,
            'finalStateEstablished': False, 'primarySelection': False, 'qualification': QUALIFICATION,
            'metadataPath': PATHS['relationships.json'], 'records': sorted(linked.values(), key=lambda r: r['recordId'])})
    require(len(assigned) == 13 and sum(r['associationKind'] == 'owner_group_derived' for p in photographs for r in p['records']) == 1, 'Unexpected candidate membership population')
    return {'schemaVersion': 1, 'sourceRepository': REPOSITORY, 'sourceRevision': REVISION,
            'sourceManifestSha256': MANIFEST_SHA256, 'sourceInputs': manifest['inputs'], 'photographs': photographs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    manifest, found = inputs()
    data = serialized(build(manifest, found))
    module = ROOT / 'assets/candidate-photographs.js'
    expected_hash = digest(data)
    code = module.read_text(encoding='utf-8')
    if args.check:
        require(OUTPUT.read_bytes() == data, 'Candidate photograph projection is stale')
        require(f'CANDIDATE_PHOTOGRAPHS_SHA256 = "{expected_hash}"' in code, 'Runtime projection hash is stale')
    else:
        OUTPUT.write_bytes(data)
        code, count = re.subn(r'CANDIDATE_PHOTOGRAPHS_SHA256 = "[a-f0-9]{64}"', f'CANDIDATE_PHOTOGRAPHS_SHA256 = "{expected_hash}"', code)
        require(count == 1, 'Missing runtime projection hash')
        module.write_text(code, encoding='utf-8', newline='\n')
    print('Candidate photographs: 2 published DNG sources; 12 direct cohort and 1 group-derived recording link; pinned inputs and projection verified')


if __name__ == '__main__':
    main()
