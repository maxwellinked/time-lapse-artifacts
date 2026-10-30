"""Regressions for retaining a corrected view over immutable historical photos."""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('additive_projection',ROOT/'tools/refresh-additive-projection.py')
R=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(R)
SURVIVOR='tlaw-858a03eb138fbf47'; RETIRED='tlaw-b03bbfba8babbf3d'
DONOR='tla-109ffe803a4ae0b0'; AFFECTED='tla-933e757350798d34'; ADDED='tla-0000000000000001'
OLD='c'*40; NEW='d'*40; SHA='a'*64
REAL_TIME_BROWSER_BASE='088d42c6293b056c5bd11941a5eae915bdd11ddf'

def table(fields,rows):
    stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fields,lineterminator='\n')
    writer.writeheader();writer.writerows(rows);return stream.getvalue().encode()

def fixture():
    metadata={rid:dict(record_id=rid,file_name='Standard_Time_Lapses/'+rid+'.mp4',work_id=SURVIVOR,
                       collection_tier='standard') for rid in (DONOR,AFFECTED)}
    fields=list(metadata[DONOR])
    inputs={'metadata.csv':table(fields,list(metadata.values())),
      'Pre_Standard_Time_Lapses/metadata.csv':table(fields,[]),
      'Work_Identity/works.csv':table(['work_id','status','superseded_by_work_id'],[
          dict(work_id=SURVIVOR,status='active',superseded_by_work_id=''),
          dict(work_id=RETIRED,status='superseded',superseded_by_work_id=SURVIVOR)]),
      'Work_Identity/work_record_links.csv':table(['record_id','work_id','owner_confirmation_state','source_hub_revision'],[
          dict(record_id=rid,work_id=SURVIVOR,owner_confirmation_state='owner_confirmed',source_hub_revision=OLD)
          for rid in (DONOR,AFFECTED)])}
    retired_photo=dict.fromkeys(R.LOOKUP.PHOTO_FIELDS,'')
    retired_photo.update(work_id=RETIRED,sha256=SHA,
        image_path='Physical_References/Photographs/images/'+RETIRED+'/'+SHA[:24]+'.jpg')
    inputs[R.LOOKUP.PHOTO_MANIFEST]=table(R.LOOKUP.PHOTO_FIELDS,[retired_photo])
    image_path='Physical_References/Photographs/images/'+SURVIVOR+'/'+SHA[:24]+'.jpg'
    image=dict(work_id=SURVIVOR,sha256=SHA,image_path=image_path,relationship_status='owner_confirmed',size_bytes='123',
        fullResolutionUrl=R.M.BASE_URL+'/resolve/'+OLD+'/'+image_path,
        hfPath='hf://datasets/'+R.M.REPOSITORY+'@'+OLD+'/'+image_path)
    entry=dict(workId=SURVIVOR,selectionStatus='primary_inspection',referenceRole='native full drawing',clarification='',
               referenceCount=1,primaryReferenceCount=1,mainImage=image,additionalReferences=[])
    source={'Work_Identity/correction.json':b'corrected source evidence\n',
            'Work_Identity/confirmation.md':b'creator confirms survivor\n',
            image_path:('version https://git-lfs.github.com/spec/v1\noid sha256:'+SHA+'\nsize 123\n').encode()}
    correction=dict(survivor_work_id=SURVIVOR,superseded_work_id=RETIRED,donor_record_id=DONOR,affected_record_id=AFFECTED)
    for key,path in [('ledger','Work_Identity/correction.json'),('confirmation','Work_Identity/confirmation.md')]:
        correction[key]=dict(path=path,sha256=R.M.digest(source[path]),bytes=len(source[path]))
    refs=dict(records={rid:copy.deepcopy(entry) for rid in (DONOR,AFFECTED)},
              sourceInputs={p:dict(sha256=R.M.digest(raw),bytes=len(raw)) for p,raw in inputs.items()},
              workIdentityCorrection=correction)
    metadata[ADDED]=dict(record_id=ADDED,file_name='Standard_Time_Lapses/added.mp4',work_id='',collection_tier='standard')
    return refs,inputs,metadata,source

class Tests(unittest.TestCase):
    def run_retention(self,refs,inputs,metadata,source):
        return R.retain_corrected_lookup(refs,inputs,metadata,{DONOR,AFFECTED},{ADDED},NEW,source.__getitem__)
    def test_corrected_baseline_is_retained_when_raw_historical_photo_is_superseded(self):
        refs,inputs,metadata,source=fixture();before=copy.deepcopy((refs,inputs,metadata))
        with self.assertRaisesRegex(R.LOOKUP.ContractError,'Photograph is not linked to an active registered work'):
            R.LOOKUP.build_rows(inputs,NEW)
        retained,counts=self.run_retention(refs,inputs,metadata,source)
        self.assertEqual(counts['records'],3);self.assertEqual(counts['nullRecords'],1)
        self.assertEqual(retained[AFFECTED]['workId'],SURVIVOR)
        self.assertEqual(retained[DONOR]['mainImage']['sha256'],SHA)
        self.assertIn('/resolve/'+NEW+'/',retained[DONOR]['mainImage']['fullResolutionUrl'])
        self.assertEqual(retained[ADDED]['selectionStatus'],'missing_work_link')
        self.assertIsNone(retained[ADDED]['mainImage'])
        self.assertEqual((refs,inputs,metadata),before)
    def test_source_registry_photo_or_correction_changes_require_separate_review(self):
        for path in ['Work_Identity/works.csv','Work_Identity/work_record_links.csv',R.LOOKUP.PHOTO_MANIFEST]:
            refs,inputs,metadata,source=fixture();inputs[path]+=b'changed'
            with self.assertRaisesRegex(ValueError,'Existing lookup source changed'):
                self.run_retention(refs,inputs,metadata,source)
        refs,inputs,metadata,source=fixture();source['Work_Identity/correction.json']+=b'changed'
        with self.assertRaisesRegex(ValueError,'creator correction evidence changed'):
            self.run_retention(refs,inputs,metadata,source)
    def test_retained_photo_payload_or_corrected_work_cannot_drift(self):
        refs,inputs,metadata,source=fixture();image=refs['records'][DONOR]['mainImage'];source[image['image_path']]=b'wrong bytes'
        with self.assertRaisesRegex(ValueError,'photograph object changed'):
            self.run_retention(refs,inputs,metadata,source)
        refs,inputs,metadata,source=fixture();refs['records'][AFFECTED]['workId']=RETIRED
        with self.assertRaisesRegex(ValueError,'lost its survivor work'):
            self.run_retention(refs,inputs,metadata,source)
    def test_added_row_cannot_gain_a_work_link(self):
        refs,inputs,metadata,source=fixture();metadata[ADDED]['work_id']=SURVIVOR
        with self.assertRaisesRegex(ValueError,'Added recording acquired'):
            self.run_retention(refs,inputs,metadata,source)
    def test_qualified_premises_retain_exact_hash_binding_and_fail_on_changed_inputs(self):
        refs,inputs,metadata,source=fixture()
        image=refs['records'][DONOR]['mainImage']
        image.update(relationship_status='proposed',evidence_reference_id='tlar-fixture')
        evidence_inputs={p:inputs.get(p,b'unchanged premise\n') for p in R.EVIDENCE.SOURCES}
        old_bytes=R.M.json_bytes(refs)
        evidence=dict(lookupSha256=R.M.digest(old_bytes),
            sourceInputs={p:dict(sha256=R.M.digest(b),bytes=len(b)) for p,b in evidence_inputs.items()},
            images={SHA:dict(workId=SURVIVOR,referenceId='tlar-fixture')})
        entries={DONOR:refs['records'][DONOR]}
        self.assertEqual(R.retain_qualified_evidence(evidence,old_bytes,entries,evidence_inputs),evidence)
        changed=copy.deepcopy(evidence_inputs);changed[R.EVIDENCE.SOURCES[-1]]+=b'changed'
        with self.assertRaisesRegex(ValueError,'premise input changed'):
            R.retain_qualified_evidence(evidence,old_bytes,entries,changed)
        with self.assertRaisesRegex(ValueError,'lookup binding differs'):
            R.retain_qualified_evidence(evidence,old_bytes+b' ',entries,evidence_inputs)
        broken=copy.deepcopy(entries);broken[DONOR]['mainImage']['work_id']=RETIRED
        with self.assertRaisesRegex(ValueError,'no longer binds'):
            R.retain_qualified_evidence(evidence,old_bytes,broken,evidence_inputs)



class RetainedUnlinkedTests(unittest.TestCase):
    def test_retains_existing_blank_work_rows_without_inventing_relationships(self):
        refs,inputs,metadata,source=fixture()
        entry=dict(workId='',selectionStatus='missing_work_link',referenceRole='missing',clarification='',referenceCount=0,primaryReferenceCount=0,mainImage=None,additionalReferences=[])
        metadata[ADDED]['work_id']=''
        refs['records'][ADDED]=entry
        retained,counts=R.retain_corrected_lookup(refs,inputs,metadata,set(refs['records']),set(),NEW,source.__getitem__)
        self.assertEqual(retained[ADDED],entry)
        self.assertEqual(counts['selectionStatuses']['missing_work_link'],1)
    def test_rejects_blank_work_entries_that_claim_photographs_or_positive_links(self):
        for field,value in [('mainImage',dict(work_id=SURVIVOR)),('referenceCount',1),('selectionStatus','primary_inspection'),('referenceRole','native full drawing')]:
            refs,inputs,metadata,source=fixture()
            entry=dict(workId='',selectionStatus='missing_work_link',referenceRole='missing',clarification='',referenceCount=0,primaryReferenceCount=0,mainImage=None,additionalReferences=[])
            entry[field]=value; refs['records'][ADDED]=entry
            with self.assertRaisesRegex(ValueError,'unlinked|work authority'):
                R.retain_corrected_lookup(refs,inputs,metadata,set(refs['records']),set(),NEW,source.__getitem__)

class AcceptedUnlinkedPopulationTests(unittest.TestCase):
    def test_all_retained_unlinked_entries_survive_an_additive_refresh(self):
        import json
        actual=json.loads((ROOT / 'data/physical-references.json').read_bytes())['records']
        unlinked={rid:entry for rid,entry in actual.items() if entry['selectionStatus']=='missing_work_link'}
        self.assertGreaterEqual(len(unlinked),47)
        refs,inputs,metadata,source=fixture()
        refs['records'].update(copy.deepcopy(unlinked))
        for rid in unlinked:
            metadata[rid]=dict(record_id=rid,work_id='')
        retained,counts=R.retain_corrected_lookup(refs,inputs,metadata,set(refs['records']),{ADDED},NEW,source.__getitem__)
        for rid,entry in unlinked.items():
            self.assertEqual(retained[rid],entry)
        self.assertEqual(counts['selectionStatuses']['missing_work_link'],len(unlinked)+1)

class RealTimeAppendTests(unittest.TestCase):
    def setUp(self):
        # Keep the original five-row append contract independent of later refreshes.
        self.previous = {
            name: subprocess.check_output(['git', 'show',
                REAL_TIME_BROWSER_BASE + ':data/real-time-source/' + name], cwd=ROOT)
            for name in ('metadata.csv', 'SHA256SUMS', 'manifest.json')
        }
        self.records = json.loads((ROOT / 'data/records.json').read_bytes())
        self.records['sourceRevision'] = NEW
        rows = list(csv.DictReader(io.StringIO(self.previous['metadata.csv'].decode())))
        self.row = {**rows[0], 'record_id': ADDED,
                    'file_name': 'Real_Time_Recordings/2026-10/Synthetic.New.MOV',
                    'original_filename': 'Synthetic.New.MOV', 'sha256': '1' * 64,
                    'hub_xet_hash': '2' * 64, 'size_bytes': '123', 'work_id': ''}
        appended = table(list(self.row), [self.row]).split(b'\n', 1)[1]
        self.source = {
            'Real_Time_Recordings/metadata.csv': self.previous['metadata.csv'] + appended,
            'Real_Time_Recordings/SHA256SUMS': self.previous['SHA256SUMS'] +
                (self.row['sha256'] + '  ' + self.row['file_name'] + '\n').encode(),
            'Real_Time_Recordings/README.md': b'Published source documentation.\n',
            'Real_Time_Recordings/SCHEMA.md': b'Published source schema.\n',
            self.row['file_name']: ('version https://git-lfs.github.com/spec/v1\n'
                'oid sha256:' + self.row['sha256'] + '\nsize 123\n').encode(),
        }

    def prepare(self, expected=1):
        self.assertTrue(callable(getattr(R, 'prepare_real_time_refresh', None)),
                        'Coordinated append-only RT refresh is missing')
        return R.prepare_real_time_refresh(self.previous, self.source.__getitem__,
                                           self.records, expected)

    def test_append_preserves_every_old_value_and_pins_page_without_reading_old_media(self):
        outputs, receipt = self.prepare()
        projection = json.loads(outputs['data/real-time-recordings.json'])
        baseline = list(csv.DictReader(io.StringIO(self.previous['metadata.csv'].decode())))
        self.assertEqual(projection['records'], baseline + [self.row])
        self.assertEqual(projection['sourceRevision'], NEW)
        self.assertEqual(receipt['previousRecords'], 5)
        self.assertEqual(receipt['records'], 6)
        self.assertEqual(receipt['addedRecords'], [ADDED])
        self.assertEqual(receipt['addedCount'], 1)
        self.assertIn(('/resolve/' + NEW + '/' + self.row['file_name']).encode(),
                      outputs['real-time-recordings.html'])
        self.assertEqual(outputs['data/real-time-source/metadata.csv'],
                         self.source['Real_Time_Recordings/metadata.csv'])

    def test_historical_bytes_rows_order_schema_and_checksum_entries_are_frozen(self):
        original = copy.deepcopy(self.source)
        changes = [
            ('Real_Time_Recordings/metadata.csv', lambda b: b.replace(b'candidate_not_calibrated', b'changed', 1)),
            ('Real_Time_Recordings/metadata.csv', lambda b: b.replace(b'\n', b'\r\n')),
            ('Real_Time_Recordings/metadata.csv', lambda b: b.split(b'\n', 1)[0] + b',extra\n' + b.split(b'\n', 1)[1]),
            ('Real_Time_Recordings/SHA256SUMS', lambda b: b.split(b'\n', 1)[1]),
        ]
        for path, mutate in changes:
            with self.subTest(path=path):
                self.source = copy.deepcopy(original)
                self.source[path] = mutate(self.source[path])
                with self.assertRaisesRegex(ValueError, 'Retained real-time'):
                    self.prepare()

    def test_expected_scope_duplicates_and_new_checksum_or_lfs_identity_fail_closed(self):
        for count in (-1, 0, 2):
            with self.subTest(count=count), self.assertRaisesRegex(ValueError, 'real-time.*(count|scope)|addition'):
                self.prepare(count)
        self.source[self.row['file_name']] = self.source[self.row['file_name']].replace(b'size 123', b'size 124')
        with self.assertRaisesRegex(ValueError, 'real-time.*identity'):
            self.prepare()
        self.setUp()
        self.source['Real_Time_Recordings/SHA256SUMS'] = self.source['Real_Time_Recordings/SHA256SUMS'].replace(
            ('1' * 64).encode(), ('3' * 64).encode())
        with self.assertRaisesRegex(ValueError, '(?i)real-time.*(validation|projection)'):
            self.prepare()

    def test_duplicate_retained_id_content_hash_or_standard_id_cannot_be_appended(self):
        first = next(csv.DictReader(io.StringIO(self.previous['metadata.csv'].decode())))
        variants = [('record_id', first['record_id']), ('sha256', first['sha256']),
                    ('record_id', self.records['records'][0]['recordId'])]
        for field, value in variants:
            with self.subTest(field=field, value=value):
                row = {**self.row, field: value}
                self.source['Real_Time_Recordings/metadata.csv'] = self.previous['metadata.csv'] + table(
                    list(row), [row]).split(b'\n', 1)[1]
                self.source['Real_Time_Recordings/SHA256SUMS'] = self.previous['SHA256SUMS'] + (
                    row['sha256'] + '  ' + row['file_name'] + '\n').encode()
                with self.assertRaisesRegex(ValueError, 'Real-time projection validation failed'):
                    self.prepare()

    def test_explicit_zero_repin_is_deterministic_and_baseline_hashes_are_checked(self):
        for name in ('metadata.csv', 'SHA256SUMS'):
            self.source['Real_Time_Recordings/' + name] = self.previous[name]
        first = self.prepare(0)
        self.assertEqual(first, self.prepare(0))
        self.assertEqual(first[1]['addedCount'], 0)
        self.previous['metadata.csv'] += b'\n'
        with self.assertRaisesRegex(ValueError, 'baseline.*binding'):
            self.prepare(0)

if __name__=='__main__':unittest.main()
