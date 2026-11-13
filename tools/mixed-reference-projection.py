"""Bounded adapter for two confirmed reference works with separate TL/RT indexes.

No membership, synchronization, photo selection, or source identity is inferred.
The existing confirmed-work generator owns rendering and historical replay.
"""
import csv
import hashlib
import io
import json
import re

REPOSITORY = 'maxwellinked/time-lapse-artifacts'
PACKET = 'Standard_Time_Lapses/Provenance/2026-11-13'
PHOTO = 'Image_Source_Masters/v2'
CONFIRMATION = 'Work_Identity/Confirmations/2026-11-13-two-reference-drawings.json'
HASH = re.compile(r'[a-f0-9]{64}\Z')
REV = re.compile(r'[a-f0-9]{40}\Z')
PHOTO_TEXT_PATHS = {PHOTO+'/'+p for p in ['README.md','SCHEMA.md','metadata.csv']} | {
    PHOTO+'/Receipts/'+p for p in ['authority.json','source-records.json','source-types.json',
        'relationships.json','published-identities.json','naming.json']}
PHOTO_HISTORICAL = {'Image_Source_Masters/v1/MANIFEST.json','Work_Images/MANIFEST.json'}
RELATION_FIELDS = ('asset_id','file_name','original_filename','sha256','size_bytes',
    'provisional_group','association_status','association_basis','canonical_work_id','canonical_record_id',
    'artist_confirmation_scope','artist_confirmation_quote','final_photo_confirmed_within_scope',
    'selected_front_promoted','exact_recording_endpoint_equality')
BINDING_OUTPUTS = {'Work_Identity/work_record_links.csv',PACKET+'/fragment_sequence_relationships.csv',
    PACKET+'/ingest_mapping.json',PACKET+'/index-binding-receipt.json'}
MODE_KEYS = [('time_lapse', 'metadata', 'timeLapseCount'), ('real_time', 'real_time', 'realTimeCount')]
SOURCE_PATHS = (
    PACKET+'/ingest-plan.json', CONFIRMATION, PACKET+'/hosted-media-identities.json',
    PACKET+'/index-binding-receipt.json', PACKET+'/binding-result.json',
    PACKET+'/ingest_mapping.json', PACKET+'/technical-summary.json',
    PACKET+'/fragment_sequence_relationships.csv', 'Real_Time_Recordings/metadata.csv',
    'Real_Time_Recordings/SHA256SUMS', PHOTO+'/MANIFEST.json',
    PHOTO+'/Receipts/source-records.json', PHOTO+'/Receipts/published-identities.json',
    PHOTO+'/Receipts/relationships.json', PHOTO+'/metadata.csv',
)


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True))


def indexed(values, key, label):
    result = {r[key]: r for r in values}
    require(len(result) == len(values), 'Duplicate '+label)
    return result


def validate_definition(value):
    require(set(value) == {'schemaVersion','browserBase','sourceBaseRevision','confirmation',
                          'ingestPlan','workCounts','photoSources'} and value['schemaVersion'] == 2,
            'Invalid mixed append definition')
    require(all(REV.fullmatch(value[k]) for k in ['browserBase','sourceBaseRevision']),
            'Immutable mixed append baselines required')
    for key, path in [('confirmation',CONFIRMATION),('ingestPlan',PACKET+'/ingest-plan.json')]:
        item=value[key]
        require(set(item)=={'path','sha256'} and item['path']==path and HASH.fullmatch(item['sha256']),
                'Invalid mixed source binding: '+key)
    counts=value['workCounts']
    require(len(counts)==2 and all(set(c)=={'workId','count','timeLapseCount','realTimeCount'}
            and re.fullmatch(r'tlaw-[a-f0-9]{16}',c['workId'])
            and all(type(c[k]) is int and c[k]>0 for k in ['count','timeLapseCount','realTimeCount'])
            and c['count']==c['timeLapseCount']+c['realTimeCount'] for c in counts)
            and len({c['workId'] for c in counts})==2
            and [(c['timeLapseCount'],c['realTimeCount']) for c in counts]==[(21,21),(17,15)],
            'Invalid bounded mixed work counts')
    photo=value['photoSources']
    require(set(photo)=={'path','sha256','count'} and photo['path']==PHOTO+'/Receipts/source-records.json'
            and HASH.fullmatch(photo['sha256']) and photo['count']==64, 'Invalid source-only photo scope')
    return value


def confirmation_members(confirmation_raw, definition, plan_raw=None):
    validate_definition(definition)
    require(sha(confirmation_raw)==definition['confirmation']['sha256'],'Mixed confirmation hash differs')
    confirmation=json.loads(confirmation_raw)
    require(confirmation['schema']=='creator-confirmed-reference-video-membership/v1',
            'Mixed confirmation schema differs')
    groups=confirmation['groups'];members=confirmation['records']
    counts=definition['workCounts']
    require([(g['work_id'],g['recording_count']) for g in groups]==[(c['workId'],c['count']) for c in counts],
            'Mixed confirmation group counts differ')
    require(len(members)==74 and len(indexed(members,'record_id','confirmed recording'))==74
            and len({r['file_path'] for r in members})==74
            and len({r['original_filename'] for r in members})==74, 'Mixed confirmation membership differs')
    expected=[]
    for group,count in zip(groups,counts):
        for mode,_,count_key in MODE_KEYS:
            subset=[m for m in members if m['work_id']==group['work_id'] and m['recording_mode']==mode]
            require(len(subset)==count[count_key]
                    and [r['sequence_position'] for r in subset]==list(range(1,count[count_key]+1))
                    and all(r['sequence_count']==count[count_key] and r['group']==group['group'] for r in subset),
                    'Independent per-mode membership/order differs')
            expected.extend(subset)
    require(members==expected,'Mixed confirmed group/mode order differs')
    for r in members:
        prefix,extension=('Standard_Time_Lapses/','.mp4') if r['recording_mode']=='time_lapse' else ('Real_Time_Recordings/','.MOV')
        require(r['file_path'].startswith(prefix) and r['file_path'].endswith(extension)
                and not any(p in ('','.','..') for p in r['file_path'].split('/'))
                and '\\' not in r['file_path'] and '\n' not in r['file_path']
                and r['original_filename'].endswith(extension)
                and not re.search(r'[/\\\r\n]',r['original_filename'])
                and HASH.fullmatch(r['sha256']) and type(r['size_bytes']) is int and r['size_bytes']>0,
                'Invalid mixed original identity/path')
    if plan_raw is not None:
        require(sha(plan_raw)==definition['ingestPlan']['sha256'],'Mixed ingest plan hash differs')
        plan=json.loads(plan_raw)
        require(plan['schema']=='reference-video-ingest-plan/v1'
                and plan['source_base_revision']==definition['sourceBaseRevision']
                and plan['confirmation_path']==definition['confirmation']['path']
                and plan['confirmation_sha256']==definition['confirmation']['sha256']
                and plan['records']==members and plan['groups']==groups,
                'Mixed ingest plan differs from confirmation')
    return members


def validate_release(before, after, confirmation_raw, media_identities, definition):
    members=confirmation_members(confirmation_raw,definition)
    maps={}
    for name,key in [('metadata','record_id'),('real_time','record_id'),('works','work_id'),('links','record_id')]:
        old=indexed(before[name],key,name);current=indexed(after[name],key,name)
        require(after[name][:len(before[name])]==before[name]
                and all(current.get(k)==r for k,r in old.items()),'Retained '+name+' rows changed')
        maps[name]={k:r for k,r in current.items() if k not in old}
    work_ids=[c['workId'] for c in definition['workCounts']]
    require(list(maps['works'])==work_ids and all(r['status']=='active' for r in maps['works'].values()),
            'New active work membership/order differs')
    binding=definition['confirmation']
    for r in maps['works'].values():
        require('confirmation_path='+binding['path'] in r['creation_evidence']
                and 'confirmation_sha256='+binding['sha256'] in r['creation_evidence'],
                'New work creation evidence differs')
    require(list(maps['links'])==[r['record_id'] for r in members], 'New link membership/order differs')
    for mode,name,_ in MODE_KEYS:
        subset=[r for r in members if r['recording_mode']==mode]
        require(list(maps[name])==[r['record_id'] for r in subset], 'New '+name+' membership/order differs')
        for member in subset:
            rid=member['record_id'];row=maps[name][rid];link=maps['links'][rid]
            require(row['recording_mode']==mode,'Recording mode differs: '+rid)
            require(row['work_id']==link['work_id']==member['work_id']
                    and link['owner_confirmation_state']=='owner_confirmed','Confirmed membership differs: '+rid)
            require(REV.fullmatch(link.get('source_hub_revision',''))
                    and 'published_creator_confirmation' in link.get('evidence_state',''), 'Pending/invalid new link pin')
            require(not link.get('surface_scope') and not link.get('temporal_scope'), 'Unsupported endpoint/surface scope')
            require(row['file_name']==member['file_path'] and row['original_filename']==member['original_filename'],
                    'Confirmed original path/name differs: '+rid)
            require(int(row['size_bytes'])==member['size_bytes']
                    and media_identities.get(member['file_path'])==(member['sha256'],member['size_bytes']),
                    'Confirmed media identity differs: '+rid)
            require(HASH.fullmatch(row.get('hub_xet_hash','')),'Missing/invalid Hub identity')
            if mode=='real_time':
                require(row['sha256']==member['sha256'],'RT media identity differs')
                require(all(row[k]==member[k] for k in ['paired_record_id','pairing_status']),
                        'RT candidate relationship differs')
                require(row['temporal_basis']=='encoded_media_timeline'
                        and row['clock_accuracy_status']=='not_externally_calibrated'
                        and row['source_role_status']=='not_independently_verified_as_camera_original',
                        'RT timing/source qualification differs')
                require(row.get('demux_status')=='not_run','RT demux qualification differs')
            else:
                require(row['recording_start_local']=='' and row['recording_start_basis']=='not_in_timing_snapshot',
                        'Unsupported physical start timing')
    require(after['selections']==before['selections'],'Retained photograph selection changed')
    require(after['unselected_work_ids']==sorted(before['unselected_work_ids']+work_ids),
            'New works must remain explicitly unselected')
    require(after['photo_manifest_sha256']==before['photo_manifest_sha256'],'Historical photograph manifest changed')
    return dict(work_ids=work_ids,added_count=38,added_recording_count=74,
        added_records=[r['record_id'] for r in members if r['recording_mode']=='time_lapse'],
        added_real_time_records=[r['record_id'] for r in members if r['recording_mode']=='real_time'],
        record_work_ids={r['record_id']:r['work_id'] for r in members})


def check_receipt(value, schema, method, key):
    require(value.get('schema')==schema and value.get('repository')==REPOSITORY
            and REV.fullmatch(value.get('revision',''))
            and value.get('observation_method')==method, 'Missing/invalid hosted source receipt')
    return indexed(value[key],'file_name','hosted path')


def validate_source_admission(source_bytes, at_revision, object_identity, definition, after, is_ancestor):
    """Check final pinned source objects and its real media/index observation chain.

    This is a Git pointer/receipt check, not a new network or full-media audit.
    """
    inputs={p:source_bytes(p) for p in SOURCE_PATHS}
    members=confirmation_members(inputs[CONFIRMATION],definition,inputs[PACKET+'/ingest-plan.json'])
    plan=json.loads(inputs[PACKET+'/ingest-plan.json'])
    for path,binding in plan['baseline'].items():
        raw=at_revision(definition['sourceBaseRevision'],path)
        require(sha(raw)==binding['sha256'] and len(raw)==binding['size_bytes'],'Source baseline identity differs')
    hosted=json.loads(inputs[PACKET+'/hosted-media-identities.json'])
    observed=check_receipt(hosted,'reference-ingest-hosted-objects/v1',
        'pinned_hub_lfs_sha_size_xet_observation','objects')
    require(set(observed)=={m['file_path'] for m in members},'Hosted video membership differs')
    require(is_ancestor(hosted['revision']),'Hosted media revision is not an ancestor')
    metadata={r['record_id']:r for r in after['metadata']+after['real_time']}
    links={r['record_id']:r for r in after['links']}
    for member in members:
        path=member['file_path'];obj=observed[path];row=metadata[member['record_id']]
        require((obj['sha256'],obj['size_bytes'])==(member['sha256'],member['size_bytes'])
                and HASH.fullmatch(obj.get('hub_xet_hash','')) and row['hub_xet_hash']==obj['hub_xet_hash']
                and object_identity(at_revision(hosted['revision'],path))==(member['sha256'],member['size_bytes']),
                'Hosted video identity/Xet differs')
    index_receipt=json.loads(inputs[PACKET+'/index-binding-receipt.json'])
    index=check_receipt(index_receipt,'reference-ingest-index-receipt/v1',
        'pinned_hub_file_sha_size_observation','files')
    index_revision=index_receipt['revision']
    require(is_ancestor(index_revision),'Metadata revision is not an ancestor')
    for path in plan['required_index_binding_files']:
        raw=source_bytes(path);observed=index.get(path,{})
        require(observed.get('sha256')==sha(raw) and observed.get('size_bytes')==len(raw)
                and at_revision(index_revision,path)==raw,'Published index binding differs: '+path)
    require(all(links[m['record_id']]['source_hub_revision']==index_revision for m in members),
            'Positive link pin differs from published metadata stage')
    mapping=json.loads(inputs[PACKET+'/ingest_mapping.json'])
    require(mapping['publication_status']=='bound_pending_final_publication'
            and mapping['metadata_revision']==index_revision and mapping['media_revision']==hosted['revision']
            and mapping['records']==members and mapping['groups']==plan['groups'], 'Source mapping remains pending or differs')
    result=json.loads(inputs[PACKET+'/binding-result.json'])
    require(result['schema']=='reference-video-ingest-binding/v1'
            and result['status']=='bound_ready_for_release_validation'
            and result['metadata_revision']==index_revision and result['media_revision']==hosted['revision']
            and result['records']==74 and result['new_work_count']==2,'Source binding is not release ready')
    require(set(result['output_bindings'])==BINDING_OUTPUTS and result['retained_baseline']==plan['baseline'],
            'Final source binding receipt coverage differs')
    for path,binding in result['output_bindings'].items():
        raw=source_bytes(path)
        require(sha(raw)==binding['sha256'] and len(raw)==binding['size_bytes'],'Final source binding output differs')
    photos=validate_photo_sources(source_bytes,at_revision,object_identity,definition,is_ancestor)
    return inputs,dict(confirmedRecordings=74,timeLapseRecordings=38,realTimeRecordings=36,
        sourcePhotoContainers=photos,originalPayloadCount=138,mediaRevision=hosted['revision'],
        metadataRevision=index_revision,verification='pinned_git_objects_and_published_observation_receipts',
        liveAvailabilityRechecked=False,coverageInferred=False,synchronizationInferred=False)


def validate_photo_sources(source_bytes, at_revision, object_identity, definition, is_ancestor):
    raw=source_bytes(definition['photoSources']['path'])
    require(sha(raw)==definition['photoSources']['sha256'],'Source-only photo snapshot hash differs')
    records=json.loads(raw)['records'];manifest=json.loads(source_bytes(PHOTO+'/MANIFEST.json'))
    hosted=json.loads(source_bytes(PHOTO+'/Receipts/published-identities.json'))
    require(manifest['schema']=='image-source-masters-package/v2'
            and manifest['state']==hosted['state']=='observed_pinned_hub_identity'
            and manifest['object_count']==len(records)==64
            and manifest['new_work_registrations']==manifest['new_primary_selections']==0,
            'Source photo package is pending or changes work/selection scope')
    require(hosted['schema']=='reference-photo-published-identities/v2' and hosted['repository']==REPOSITORY
            and REV.fullmatch(hosted.get('revision',''))
            and hosted['observation_method']=='pinned_hub_lfs_sha_size_xet_observation', 'Invalid hosted photo receipt')
    require(is_ancestor(hosted['revision']),'Hosted photo revision is not an ancestor')
    require(set(manifest['file_sha256'])==PHOTO_TEXT_PATHS
            and set(manifest['historical_manifests'])==PHOTO_HISTORICAL
            and manifest['source_records_sha256']==definition['photoSources']['sha256']
            and manifest['source_base_revision']==definition['sourceBaseRevision']
            and manifest['asset_ids']==[r['asset_id'] for r in records],
            'Source photo manifest coverage differs')
    for path,digest in manifest['file_sha256'].items():
        require(path.startswith(PHOTO+'/') and '..' not in path.split('/')
                and sha(source_bytes(path))==digest,'Source photo manifest member differs')
    for path,digest in manifest['historical_manifests'].items():
        require(sha(source_bytes(path))==digest==sha(at_revision(definition['sourceBaseRevision'],path)),
                'Historical source photograph manifest changed')
    observations=indexed(hosted['objects'],'file_name','source photo observation')
    actual=indexed(rows(source_bytes(PHOTO+'/metadata.csv')),'file_name','source photo row')
    relation_receipt=json.loads(source_bytes(PHOTO+'/Receipts/relationships.json'))
    require(set(relation_receipt)=={'schema','scope','review_groups_are_canonical_work_ids','objects'}
            and relation_receipt['schema']=='reference-photo-relationships/v2'
            and relation_receipt['scope']=='retained_qualified_review_associations'
            and relation_receipt['review_groups_are_canonical_work_ids'] is False,
            'Source photo association receipt scope differs')
    relations=indexed(relation_receipt['objects'],'file_name','source photo relation')
    require(set(observations)==set(actual)==set(relations)=={r['file_name'] for r in records},
            'Source photo population differs')
    for sequence,record in enumerate(records,1):
        path=record['file_name'];row=actual[path];observed=observations[path];relation=relations[path]
        require(row['work_id']=='' and record['canonical_work_id'] is None
                and relation['canonical_work_id'] is None and relation['canonical_record_id'] is None
                and relation['selected_front_promoted'] is False and relation['exact_recording_endpoint_equality'] is None,
                'Source-only photo acquired unsupported membership/selection')
        require(relation=={k:record[k] for k in RELATION_FIELDS}, 'Qualified photo association changed')
        require(row['original_filename']==record['original_filename']
                and row['detected_container']==record['detected_container']
                and row['supplied_extension']==record['supplied_extension']
                and row['extension_container_mismatch']==str(record['extension_container_mismatch']).lower(),
                'Source photo original name/type differs')
        qualifications=dict(schema_version='image-source-master-row/v2',asset_id=record['asset_id'],
            review_group=record['provisional_group'],association_status=record['association_status'],
            source_role_status=record['source_role_status'],capture_time_value=record['capture_time_as_reported'] or '',
            capture_time_basis=record['capture_time_basis'],stored_width_px=str(record['stored_dimensions_px'][0]),
            stored_height_px=str(record['stored_dimensions_px'][1]),
            exif_orientation='' if record['exif_orientation'] is None else str(record['exif_orientation']),
            filename_date_basis='no_canonical_work_finish_context',filename_sequence=str(sequence))
        for prefix,name in [('relationship','relationships.json'),('type','source-types.json'),('naming','naming.json')]:
            receipt_path=PHOTO+'/Receipts/'+name
            qualifications[prefix+'_receipt_path']=receipt_path
            qualifications[prefix+'_receipt_sha256']=sha(source_bytes(receipt_path))
        require(all(row.get(k)==v for k,v in qualifications.items()),'Source photo qualification differs')
        expected=(record['sha256'],record['size_bytes'])
        require((row['sha256'],int(row['size_bytes']))==expected
                and (observed['sha256'],observed['size_bytes'])==expected
                and HASH.fullmatch(observed.get('hub_xet_hash','')) and row['hub_xet_hash']==observed['hub_xet_hash']
                and row['public_availability']=='available_at_pinned_revision'
                and row['containing_revision']==hosted['revision']
                and object_identity(source_bytes(path))==expected
                and object_identity(at_revision(hosted['revision'],path))==expected,
                'Source photo identity/availability differs')
    return dict(count=64,canonicalWorkIdsAssigned=0,selectedFrontsAdded=0,
        sourceRecords=definition['photoSources'],manifestPath=PHOTO+'/MANIFEST.json',
        manifestSha256=sha(source_bytes(PHOTO+'/MANIFEST.json')),mediaRevision=hosted['revision'])
