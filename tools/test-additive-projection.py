"""Regressions for retaining a corrected view over immutable historical photos."""
import copy
import csv
import importlib.util
import io
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('additive_projection',ROOT/'tools/refresh-additive-projection.py')
R=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(R)
SURVIVOR='tlaw-858a03eb138fbf47'; RETIRED='tlaw-b03bbfba8babbf3d'
DONOR='tla-109ffe803a4ae0b0'; AFFECTED='tla-933e757350798d34'; ADDED='tla-0000000000000001'
OLD='c'*40; NEW='d'*40; SHA='a'*64

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

if __name__=='__main__':unittest.main()
