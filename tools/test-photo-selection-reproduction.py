"""Historical replay and current photo substitutions from immutable inputs.

No original video/RAW downloads. Current application code is the template input;
this test proves generated constants/cache tags, not independent code synthesis.
"""
import copy,hashlib,importlib.util,json,os,re,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('photo_export',ROOT/'tools/export-photo-selections.py')
PHOTO=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(PHOTO)
def git(root,revision,path):return subprocess.check_output(['git','-C',str(root),'show',revision+':'+path])
def prior_bytes():return git(ROOT,PHOTO.BROWSER_BASE,'data/selected-fronts.json')
def current_manifest():return json.loads((ROOT/PHOTO.MANIFEST).read_bytes())
class PhotoProjectionReproductionTests(unittest.TestCase):
 def test_output_allowlist_rejects_missing_and_extra_paths(self):
  manifest=current_manifest()
  self.assertEqual(set(manifest['outputs']),PHOTO.PHOTO_OUTPUTS)
  for mutation in [lambda m:m['outputs'].pop('data/selected-fronts.json'),lambda m:m['outputs'].update({'data/records.json':{'sha256':'0'*64,'size_bytes':1}})]:
   candidate=copy.deepcopy(manifest);mutation(candidate)
   with self.assertRaisesRegex(ValueError,'allowlist'):PHOTO.validate_projection_manifest(candidate,ROOT)
 def test_preserved_metadata_is_bound_to_immutable_browser_input(self):
  raw=prior_bytes();self.assertEqual(PHOTO.load_prior(raw)['status'],'derived_display_projection')
  changed=json.loads(raw);changed['work_identity_correction']['survivor_work_id']='tlaw-'+'0'*16
  with self.assertRaisesRegex(ValueError,'immutable prior'):PHOTO.load_prior(json.dumps(changed).encode())
 def test_source_table_pointer_requires_oid_and_size(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'table.parquet';expected={'sha256':'a'*64,'bytes':113}
   def pointer(h,n):path.write_bytes(('version https://git-lfs.github.com/spec/v1\noid sha256:'+h+'\nsize '+str(n)+'\n').encode())
   pointer('a'*64,113);self.assertEqual(PHOTO.table_identity(path,expected),('a'*64,113))
   for h,n in [('b'*64,113),('a'*64,112)]:
    pointer(h,n)
    with self.assertRaisesRegex(ValueError,'OID/hash or size'):PHOTO.table_identity(path,expected)
   path.write_bytes(b'version https://git-lfs.github.com/spec/v1\noid not-a-valid-pointer\n')
   with self.assertRaisesRegex(ValueError,'Malformed'):PHOTO.table_identity(path,expected)
 def test_current_photo_artifacts_rebuild_from_pinned_source_and_prior(self):
  source_repo=os.environ.get('HF_SOURCE_ROOT')
  self.assertTrue(source_repo,'Set HF_SOURCE_ROOT to a Git repository with the accepted photo source commit')
  manifest=current_manifest();revision=manifest['selection_registry']['revision'];prior=prior_bytes()
  with tempfile.TemporaryDirectory() as folder:
   temp=Path(folder);source=temp/'source';browser=temp/'browser'
   for relative in PHOTO.SOURCE_PATHS:
    path=source/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(git(source_repo,revision,relative))
   for relative in PHOTO.TEMPLATES:
    content=(ROOT/relative).read_text(encoding='utf-8')
    content=re.sub(r'(export const (?:SELECTED_FRONTS_SHA256|PHOTO_SELECTION_REGISTRY_SHA256|PHOTOGRAPH_DOWNLOADS_SHA256) = ")[a-f0-9]+(";)',lambda m:m[1]+'0'*64+m[2],content)
    content=re.sub(r'(export const PHOTO_SELECTION_SOURCE_REVISION = ")[a-f0-9]+(";)',lambda m:m[1]+'0'*40+m[2],content)
    content=re.sub(r'\?v=photo-selections-[A-Za-z0-9_-]+','?v=REBUILD',content)
    path=browser/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8',newline='\n')
   for row in PHOTO.load_prior(prior)['selections']:
    relative='selected-fronts/'+row['work_id']+'.jpg';path=browser/relative;path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/relative,path)
   (browser/'data').mkdir(exist_ok=True)
   PHOTO.export(source,browser,revision,prior)
   rebuilt=json.loads((browser/PHOTO.MANIFEST).read_bytes())
   self.assertEqual(set(rebuilt['outputs']),PHOTO.PHOTO_OUTPUTS)
   for relative in (*sorted(PHOTO.PHOTO_OUTPUTS),PHOTO.MANIFEST):
    with self.subTest(path=relative):self.assertEqual((browser/relative).read_bytes(),(ROOT/relative).read_bytes())
   # A different accepted source pin must refresh entry-point caches even if
   # registry bytes and all selected photographs remain identical.
   before=(browser/'index.html').read_bytes()
   PHOTO.export(source,browser,'f'*40,prior)
   self.assertNotEqual((browser/'index.html').read_bytes(),before)
 def test_retained_additive_release_still_replays_exactly(self):
  source=os.environ.get('HF_SOURCE_ROOT');self.assertTrue(source)
  receipt=json.loads(git(ROOT,PHOTO.BROWSER_BASE,'data/source-refresh.json'))
  spec=importlib.util.spec_from_file_location('retained_additive',ROOT/'tools/refresh-additive-projection.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  outputs=module.refresh(Path(source),receipt['sourceRevision'],ROOT,receipt['browserBase'],receipt['generatedAt'],receipt['addedCount'],receipt.get('realTime',{}).get('addedCount'),asset_revision=PHOTO.BROWSER_BASE)
  for relative,expected in outputs.items():
   with self.subTest(path=relative):self.assertEqual(git(ROOT,PHOTO.BROWSER_BASE,relative),expected)
if __name__=='__main__':unittest.main()
