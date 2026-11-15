"""Mixed source admission must preserve membership, independent orders and scope."""
import copy
import csv
import io
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

class MixedReferenceProjectionTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('mixed', ROOT/'tools/mixed-reference-projection.py')
        self.m = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.m)
        self.definition=json.loads((ROOT/'tools/projection-definitions/2026-11-13-reference-drawings.json').read_bytes())
        self.raw=(ROOT/'tests/fixtures/2026-11-13-two-reference-drawings.json').read_bytes()
        self.plan=(ROOT/'tests/fixtures/2026-11-13-reference-ingest-plan.json').read_bytes()
        self.members=json.loads(self.raw)['records']
        self.before=dict(metadata=[dict(record_id='retained-tl',size_bytes='10')],
            real_time=[dict(record_id='retained-rt',size_bytes='20')],
            works=[dict(work_id='retained-work')],links=[dict(record_id='retained-link')],
            selections=[{'work_id':'retained-work'}],unselected_work_ids=['tlaw-0000000000000000'],
            photo_manifest_sha256='retained-manifest')
        self.after=copy.deepcopy(self.before); self.identities={}
        for work in self.definition['workCounts']:
            self.after['works'].append(dict(work_id=work['workId'],status='active',
                creation_evidence='confirmation_path='+self.definition['confirmation']['path']+'; confirmation_sha256='+self.definition['confirmation']['sha256']))
            self.after['unselected_work_ids'].append(work['workId'])
        self.after['unselected_work_ids'].sort()
        for record in self.members:
            row=dict(record_id=record['record_id'],work_id=record['work_id'],file_name=record['file_path'],
                original_filename=record['original_filename'],size_bytes=str(record['size_bytes']),
                hub_xet_hash='f'*64,recording_mode=record['recording_mode'])
            if record['recording_mode']=='real_time':
                row.update(sha256=record['sha256'],paired_record_id=record['paired_record_id'],
                    pairing_status=record['pairing_status'],temporal_basis='encoded_media_timeline',
                    clock_accuracy_status='not_externally_calibrated',source_role_status='not_independently_verified_as_camera_original',demux_status='not_run')
                self.after['real_time'].append(row)
            else:
                row.update(recording_start_local='',recording_start_basis='not_in_timing_snapshot')
                self.after['metadata'].append(row)
            self.after['links'].append(dict(record_id=record['record_id'],work_id=record['work_id'],
                owner_confirmation_state='owner_confirmed',source_hub_revision='e'*40,
                evidence_state='published_creator_confirmation;canonical_record_join',surface_scope='',temporal_scope=''))
            self.identities[record['file_path']]=(record['sha256'],record['size_bytes'])

    def check(self):
        return self.m.validate_release(self.before,self.after,self.raw,self.identities,self.definition)

    def test_accepts_exact_mixed_scope_without_promoting_photos(self):
        out=self.check()
        self.assertEqual(out['added_count'],38)
        self.assertEqual(out['added_recording_count'],74)
        self.assertEqual(len(out['added_real_time_records']),36)
        self.assertEqual(len(out['record_work_ids']),74)
        self.assertEqual(self.after['selections'],self.before['selections'])

    def test_confirmed_order_is_independent_within_each_mode(self):
        self.check()
        for key in ['metadata','real_time','links']:
            after=copy.deepcopy(self.after);after[key][-2:]=reversed(after[key][-2:])
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'order'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)

    def test_old_rows_and_relationships_cannot_change(self):
        for key in ['metadata','real_time','links','works']:
            after=copy.deepcopy(self.after);after[key][0]['invented']='new'
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'Retained'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)

    def test_reassignment_or_unconfirmed_membership_is_rejected(self):
        for key in ['metadata','real_time','links']:
            after=copy.deepcopy(self.after);after[key][-1]['work_id']=self.definition['workCounts'][0]['workId']
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'membership'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)
        self.after['links'][-1]['owner_confirmation_state']='proposed'
        with self.assertRaisesRegex(ValueError,'membership'):self.check()

    def test_no_mode_migration_or_missing_rt_member(self):
        self.after['real_time'][-1]['recording_mode']='time_lapse'
        with self.assertRaisesRegex(ValueError,'mode'):self.check()
        self.after['real_time'].pop()
        with self.assertRaisesRegex(ValueError,'membership'):self.check()

    def test_unsupported_scope_and_pending_pins_rejected(self):
        for key,value in [('temporal_scope','endpoint'),('surface_scope','front'),('source_hub_revision','')]:
            after=copy.deepcopy(self.after);after['links'][-1][key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'scope|pin'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)

    def test_candidate_status_and_counterpart_ids_cannot_be_promoted(self):
        for key,value in [('pairing_status','aligned'),('paired_record_id','tla-'+'0'*16),('temporal_basis','physical_time'),('demux_status','passed_no_logged_errors')]:
            after=copy.deepcopy(self.after);after['real_time'][-1][key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'candidate|timing|demux'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)

    def test_exact_media_hash_size_original_name_and_work_are_bound(self):
        record=self.members[-1]
        for value in [('0'*64,record['size_bytes']),(record['sha256'],record['size_bytes']+1)]:
            self.identities[record['file_path']]=value
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'media identity'):self.check()
        self.identities[record['file_path']]=(record['sha256'],record['size_bytes'])
        self.after['real_time'][-1]['original_filename']='different.MOV'
        with self.assertRaisesRegex(ValueError,'original'):self.check()

    def test_source_confirmation_hash_and_plan_cannot_drift(self):
        out=self.m.confirmation_members(self.raw,self.definition,self.plan)
        self.assertEqual(len(out),74)
        for name in ['raw','plan']:
            args={'confirmation_raw':self.raw,'definition':self.definition,'plan_raw':self.plan}
            args['confirmation_raw' if name=='raw' else 'plan_raw']+=b'\n'
            with self.subTest(name=name),self.assertRaisesRegex(ValueError,'hash'):
                self.m.confirmation_members(**args)

    def test_no_added_work_photo_or_historical_photo_reinterpretation(self):
        for key,value in [('selections',self.after['selections']+[{'work_id':self.members[0]['work_id']}]),
                          ('unselected_work_ids',[]),('photo_manifest_sha256','changed')]:
            after=copy.deepcopy(self.after);after[key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'photo|unselected'):
                self.m.validate_release(self.before,after,self.raw,self.identities,self.definition)

    def test_definition_rejects_mode_count_drift_or_unbounded_scope(self):
        for key,value in [('schemaVersion',3),('photoSources',dict(self.definition['photoSources'],count=65))]:
            value_def=copy.deepcopy(self.definition);value_def[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):self.m.validate_definition(value_def)
        self.definition['workCounts'][0]['realTimeCount']=20
        with self.assertRaisesRegex(ValueError,'counts'):self.m.validate_definition(self.definition)


class SourcePhotoGateTests(unittest.TestCase):
    """Synthetic receipt values live only in memory; none claims hosted availability."""
    def setUp(self):
        spec=importlib.util.spec_from_file_location('photo_gate',ROOT/'tools/mixed-reference-projection.py')
        self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.definition=json.loads((ROOT/'tools/projection-definitions/2026-11-13-reference-drawings.json').read_bytes())
        raw=(ROOT/'tests/fixtures/2026-11-13-photo-source-records.json').read_bytes()
        self.records=json.loads(raw)['records'];self.rev='f'*40;self.root=self.m.PHOTO
        self.files={self.definition['photoSources']['path']:raw}
        self.metadata=[];self.observed=[];self.relations=[]
        for r in self.records:
            # Deliberately synthetic Xet token: not written to any publication file.
            xet=hashlib.sha256(('TEST-ONLY-XET:'+r['sha256']).encode()).hexdigest()
            self.metadata.append(dict(file_name=r['file_name'],work_id='',original_filename=r['original_filename'],
                detected_container=r['detected_container'],supplied_extension=r['supplied_extension'],
                extension_container_mismatch=str(r['extension_container_mismatch']).lower(),sha256=r['sha256'],
                size_bytes=str(r['size_bytes']),hub_xet_hash=xet,public_availability='available_at_pinned_revision',containing_revision=self.rev))
            self.observed.append(dict(file_name=r['file_name'],sha256=r['sha256'],size_bytes=r['size_bytes'],hub_xet_hash=xet))
            self.relations.append({k:r[k] for k in self.m.RELATION_FIELDS})
            self.files[r['file_name']]=('version https://git-lfs.github.com/spec/v1\noid sha256:'+r['sha256']+'\nsize '+str(r['size_bytes'])+'\n').encode()
        self.hosted=dict(schema='reference-photo-published-identities/v2',repository=self.m.REPOSITORY,
            state='observed_pinned_hub_identity',revision=self.rev,observation_method='pinned_hub_lfs_sha_size_xet_observation',objects=self.observed)
        self.manifest=dict(schema='image-source-masters-package/v2',state='observed_pinned_hub_identity',object_count=64,
            new_work_registrations=0,new_primary_selections=0,file_sha256={},historical_manifests={})
        self.ancestor=True
        for path in self.m.PHOTO_TEXT_PATHS | self.m.PHOTO_HISTORICAL:
            self.files.setdefault(path,b'TEST-ONLY placeholder for non-displayed receipt or documentation')
        self.manifest.update(source_records_sha256=self.definition['photoSources']['sha256'],
            source_base_revision=self.definition['sourceBaseRevision'],asset_ids=[r['asset_id'] for r in self.records],
            historical_manifests={p:hashlib.sha256(self.files[p]).hexdigest() for p in self.m.PHOTO_HISTORICAL})
        for sequence,(row,r) in enumerate(zip(self.metadata,self.records),1):
            row.update(schema_version='image-source-master-row/v2',asset_id=r['asset_id'],
                review_group=r['provisional_group'],association_status=r['association_status'],
                source_role_status=r['source_role_status'],capture_time_value=r['capture_time_as_reported'] or '',
                capture_time_basis=r['capture_time_basis'],stored_width_px=str(r['stored_dimensions_px'][0]),
                stored_height_px=str(r['stored_dimensions_px'][1]),exif_orientation='' if r['exif_orientation'] is None else str(r['exif_orientation']),
                filename_date_basis='no_canonical_work_finish_context',filename_sequence=str(sequence))

    def check(self):
        encode=lambda v:(json.dumps(v)+'\n').encode()
        self.files[self.root+'/MANIFEST.json']=encode(self.manifest)
        self.files[self.root+'/Receipts/published-identities.json']=encode(self.hosted)
        self.files[self.root+'/Receipts/relationships.json']=encode(dict(schema='reference-photo-relationships/v2',
            scope='retained_qualified_review_associations',review_groups_are_canonical_work_ids=False,objects=self.relations))
        for row in self.metadata:
            for prefix,name in [('relationship','relationships.json'),('type','source-types.json'),('naming','naming.json')]:
                path=self.root+'/Receipts/'+name
                row[prefix+'_receipt_path']=path;row[prefix+'_receipt_sha256']=hashlib.sha256(self.files[path]).hexdigest()
        stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fieldnames=list(self.metadata[0]))
        writer.writeheader();writer.writerows(self.metadata)
        self.files[self.root+'/metadata.csv']=stream.getvalue().encode()
        self.manifest['file_sha256']={p:hashlib.sha256(self.files[p]).hexdigest() for p in self.m.PHOTO_TEXT_PATHS}
        self.files[self.root+'/MANIFEST.json']=encode(self.manifest)
        def identity(raw):
            parts=raw.decode().splitlines();return parts[1].split(':',1)[1],int(parts[2].split()[1])
        return self.m.validate_photo_sources(self.files.__getitem__,lambda rev,path:self.files[path],identity,
            self.definition,lambda rev:self.ancestor)

    def test_exact_unassigned_and_mismatched_sources_are_kept_without_work_membership(self):
        result=self.check();self.assertEqual(result['count'],64)
        self.assertEqual(result['canonicalWorkIdsAssigned'],0)
        unassigned=next(r for r in self.records if r['original_filename']=='20261112_080306.jpg')
        mismatch=next(r for r in self.records if r['original_filename']=='IMG_3786.DNG')
        self.assertIsNone(unassigned['canonical_work_id']);self.assertEqual(unassigned['provisional_group'],'unresolved')
        self.assertTrue(mismatch['extension_container_mismatch']);self.assertEqual(mismatch['detected_container'],'JPEG/JFIF/MPO')

    def test_pending_photo_package_is_rejected(self):
        self.hosted['state']=self.manifest['state']='pending'
        with self.assertRaisesRegex(ValueError,'pending'):self.check()

    def test_photo_review_group_cannot_become_canonical_membership(self):
        self.relations[0]['canonical_work_id']=self.definition['workCounts'][0]['workId']
        with self.assertRaisesRegex(ValueError,'membership'):self.check()

    def test_narrow_photo_confirmation_cannot_be_broadened(self):
        self.relations[0]['artist_confirmation_scope']='all photos in work'
        with self.assertRaisesRegex(ValueError,'association'):self.check()

    def test_omitted_relationship_qualifiers_are_rejected(self):
        del self.relations[0]['artist_confirmation_scope']
        with self.assertRaisesRegex(ValueError,'association'):self.check()

    def test_photo_csv_qualification_cannot_promote_review_group(self):
        for key,value in [('association_status','owner_confirmed_work'),('review_group','confirmed_group')]:
            original=self.metadata[0].get(key);self.metadata[0][key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'qualification'):self.check()
            if original is None:self.metadata[0].pop(key)
            else:self.metadata[0][key]=original

    def test_missing_manifest_coverage_is_rejected(self):
        self.manifest['historical_manifests']={}
        with self.assertRaisesRegex(ValueError,'coverage'):self.check()

    def test_type_mismatch_cannot_be_repaired_by_relabeling_bytes(self):
        row=next(r for r in self.metadata if r['original_filename']=='IMG_3786.DNG');row['detected_container']='DNG'
        with self.assertRaisesRegex(ValueError,'type'):self.check()

    def test_xet_and_source_payload_must_match_hosted_receipt(self):
        self.metadata[0]['hub_xet_hash']='0'*64
        with self.assertRaisesRegex(ValueError,'identity'):self.check()
        self.metadata[0]['hub_xet_hash']=self.observed[0]['hub_xet_hash']
        path=self.records[0]['file_name'];self.files[path]=self.files[path].replace(self.records[0]['sha256'].encode(),b'0'*64)
        with self.assertRaisesRegex(ValueError,'identity'):self.check()

    def test_unrelated_hosted_revision_is_rejected(self):
        self.ancestor=False
        with self.assertRaisesRegex(ValueError,'ancestor'):self.check()



class SourceAdmissionGateTests(unittest.TestCase):
    """In-memory synthetic Git/observation chain; no fixture is publication evidence."""
    def setUp(self):
        MixedReferenceProjectionTests.setUp(self)
        self.encode=lambda v:(json.dumps(v)+'\n').encode()
        self.files={p:b'fixture' for p in self.m.SOURCE_PATHS}
        self.old={};self.plan_value=json.loads(self.plan)
        for path in self.plan_value['baseline']:
            self.old[path]=('SYNTHETIC BASELINE: '+path).encode()
        self.plan_value['baseline']={p:dict(sha256=hashlib.sha256(raw).hexdigest(),size_bytes=len(raw)) for p,raw in self.old.items()}
        self.plan=self.encode(self.plan_value);self.definition['ingestPlan']['sha256']=hashlib.sha256(self.plan).hexdigest()
        self.files[self.m.PACKET+'/ingest-plan.json']=self.plan
        self.files[self.m.CONFIRMATION]=self.raw
        for key,path in [('metadata','metadata.csv'),('real_time','Real_Time_Recordings/metadata.csv'),('links','Work_Identity/work_record_links.csv')]:
            fields=list(dict.fromkeys(k for row in self.after[key] for k in row))
            out=io.StringIO(newline='');writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader();writer.writerows(self.after[key])
            self.files[path]=out.getvalue().encode()
        self.hosted=dict(schema='reference-ingest-hosted-objects/v1',repository=self.m.REPOSITORY,revision='d'*40,
            observation_method='pinned_hub_lfs_sha_size_xet_observation',objects=[])
        for member in self.members:
            self.hosted['objects'].append(dict(file_name=member['file_path'],sha256=member['sha256'],size_bytes=member['size_bytes'],hub_xet_hash='f'*64))
            self.files[member['file_path']]=('version https://git-lfs.github.com/spec/v1\noid sha256:'+member['sha256']+'\nsize '+str(member['size_bytes'])+'\n').encode()
        self.index=dict(schema='reference-ingest-index-receipt/v1',repository=self.m.REPOSITORY,revision='e'*40,
            observation_method='pinned_hub_file_sha_size_observation',files=[
                dict(file_name=p,sha256=hashlib.sha256(self.files[p]).hexdigest(),size_bytes=len(self.files[p]))
                for p in self.plan_value['required_index_binding_files']])
        self.mapping=dict(publication_status='bound_pending_final_publication',metadata_revision='e'*40,media_revision='d'*40,
            records=self.members,groups=self.plan_value['groups'])
        self.result=dict(schema='reference-video-ingest-binding/v1',status='bound_ready_for_release_validation',
            metadata_revision='e'*40,media_revision='d'*40,records=74,new_work_count=2,retained_baseline=self.plan_value['baseline'])
        self.pinned_overrides={};self.ancestor=True;self.drop_binding=False

    def admission(self):
        for name,value in [('hosted-media-identities.json',self.hosted),('index-binding-receipt.json',self.index),('ingest_mapping.json',self.mapping)]:
            self.files[self.m.PACKET+'/'+name]=self.encode(value)
        self.result['output_bindings']={p:dict(sha256=hashlib.sha256(self.files[p]).hexdigest(),size_bytes=len(self.files[p])) for p in self.m.BINDING_OUTPUTS}
        if self.drop_binding:self.result['output_bindings'].pop('Work_Identity/work_record_links.csv')
        self.files[self.m.PACKET+'/binding-result.json']=self.encode(self.result)
        def identity(raw):
            parts=raw.decode().splitlines();return parts[1].split(':',1)[1],int(parts[2].split()[1])
        def at_revision(revision,path):
            if revision==self.definition['sourceBaseRevision']:return self.old[path]
            return self.pinned_overrides.get((revision,path),self.files[path])
        with patch.object(self.m,'validate_photo_sources',return_value={'count':64,'canonicalWorkIdsAssigned':0}):
            return self.m.validate_source_admission(self.files.__getitem__,at_revision,identity,self.definition,self.after,lambda rev:self.ancestor)

    def test_hosted_metadata_stage_and_final_chain_are_bound(self):
        inputs,result=self.admission()
        self.assertEqual(set(inputs),set(self.m.SOURCE_PATHS))
        self.assertEqual(result['originalPayloadCount'],138)
        self.assertFalse(result['coverageInferred']);self.assertFalse(result['synchronizationInferred'])
        self.assertFalse(result['liveAvailabilityRechecked'])

    def test_pending_mapping_cannot_be_admitted(self):
        self.mapping['publication_status']='staged_pending_index_binding'
        with self.assertRaisesRegex(ValueError,'pending'):self.admission()

    def test_hosted_xet_must_equal_canonical_video_row(self):
        self.hosted['objects'][0]['hub_xet_hash']='0'*64
        with self.assertRaisesRegex(ValueError,'Xet'):self.admission()

    def test_actual_object_at_media_pin_must_match(self):
        member=self.members[0];self.pinned_overrides[('d'*40,member['file_path'])]=self.files[member['file_path']].replace(member['sha256'].encode(),b'0'*64)
        with self.assertRaisesRegex(ValueError,'identity'):self.admission()

    def test_metadata_pin_cannot_point_to_different_csv_bytes(self):
        self.pinned_overrides[('e'*40,'metadata.csv')]=b'different source bytes'
        with self.assertRaisesRegex(ValueError,'index binding'):self.admission()

    def test_link_pin_must_equal_the_observed_metadata_pin(self):
        self.after['links'][-1]['source_hub_revision']='c'*40
        with self.assertRaisesRegex(ValueError,'Positive link pin'):self.admission()

    def test_missing_final_binding_output_is_rejected(self):
        self.drop_binding=True
        with self.assertRaisesRegex(ValueError,'coverage'):self.admission()

    def test_unrelated_stage_ancestry_is_rejected(self):
        self.ancestor=False
        with self.assertRaisesRegex(ValueError,'ancestor'):self.admission()


if __name__=='__main__':unittest.main()
