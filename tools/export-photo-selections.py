"""Rebuild browser photo data from pinned source inputs and retained prior metadata.

Current application code is the implementation template. This generator changes
its declared hashes/cache tags; semantic tests cover handwritten behavior.
"""
from pathlib import Path
import argparse,hashlib,json,re,subprocess
REGISTRY='Physical_References/Selected_Front_Downloads/selections.json'
WORK_TABLE='drawing_photographs.parquet'
WORK_MANIFEST='drawing_photographs.manifest.json'
DOWNLOADS='Physical_References/Selected_Front_Downloads/downloads.json'
SOURCE_PATHS=(REGISTRY,WORK_TABLE,WORK_MANIFEST,DOWNLOADS)
REPO='maxwellinked/time-lapse-artifacts'
BROWSER_BASE='290880f54e13b1b418321dfea3c9aaaf9f85d6df'
PRIOR_SHA256='e26dc29b4762a8562c47b7aa2cba0ce11ce6c7972b8f2d55d312c77b17397fc8'
MANIFEST='data/photo-selection-projection.json'
TEMPLATES=('assets/selected-fronts.js','assets/photograph-downloads.js','assets/app.js','assets/drawing-archive.js','index.html','drawings.html')
PHOTO_OUTPUTS=frozenset(('data/selected-fronts.json','data/photograph-downloads.json','data/source-photo-selections.json',*TEMPLATES))
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n')
def object_identity(path):
 with path.open('rb') as f:head=f.read(256)
 if head.startswith(b'version https://git-lfs.github.com/spec/v1'):
  raw=path.read_bytes().replace(b'\r\n',b'\n')
  match=re.fullmatch(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([a-f0-9]{64})\nsize ([0-9]+)\n?',raw)
  require(match is not None,'Malformed source table LFS pointer')
  return match[1].decode(),int(match[2])
 return digest(path),path.stat().st_size
def table_identity(path,declaration):
 identity=object_identity(path)
 require(identity==(declaration['sha256'],declaration['bytes']),'Source work table OID/hash or size differs from manifest')
 return identity
def load_prior(raw):
 require(sha(raw)==PRIOR_SHA256,'Retained browser metadata differs from immutable prior')
 return json.loads(raw)
def selection_identity(row):
 return {'work_id':row['work_id'],'photo_role':row['photo_role'],'source_photograph_sha256':row['source_photograph_sha256'],'display':{'output_display_sha256':row['display']['output_display_sha256']}}
def verify_source_checkout(source,revision):
 for relative in SOURCE_PATHS:
  pinned=subprocess.check_output(['git','-C',str(source),'show',revision+':'+relative])
  path=source/relative
  if relative==WORK_TABLE:
   match=re.fullmatch(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([a-f0-9]{64})\nsize ([0-9]+)\n?',pinned)
   expected=(match[1].decode(),int(match[2])) if match else (sha(pinned),len(pinned))
   require(object_identity(path)==expected,'Source table differs from pinned Git object')
  else:require(path.read_bytes()==pinned,'Source control differs from pinned Git bytes: '+relative)
def validate_projection_manifest(value,root):
 require(set(value['outputs'])==PHOTO_OUTPUTS,'Photo export output allowlist differs')
 for relative,item in value['outputs'].items():
  path=root/relative
  require(path.is_file() and digest(path)==item['sha256'] and path.stat().st_size==item['size_bytes'],'Photo export output identity differs: '+relative)
 return True

def export(source,destination,revision,prior_bytes):
 require(re.fullmatch('[a-f0-9]{40}',revision) is not None,'Immutable source revision required')
 prior=load_prior(prior_bytes)
 raw=(source/REGISTRY).read_bytes();registry=json.loads(raw);registry_sha=sha(raw)
 table_manifest=load(source/WORK_MANIFEST)
 require(table_manifest['selection_registry']=={'repository':REPO,'path':REGISTRY,'sha256':registry_sha},'Source work projection differs from registry')
 table_sha,table_size=table_identity(source/WORK_TABLE,table_manifest['outputs'][WORK_TABLE])
 downloads=load(source/DOWNLOADS);expected=[]
 for row in registry['selections']:
  d=row['download'];entry={k:d[k] for k in ('path','sha256','width_px','height_px','size_bytes','resolution_class','media_revision')}
  entry.update(work_id=row['work_id'],source_sha256=row['source_photograph_sha256'],display_sha256=row['display']['sha256'],representation=d.get('representation'),source_filename=d.get('source_filename'));expected.append(entry)
 require(downloads.get('selection_registry',{}).get('sha256')==registry_sha and downloads.get('rows')==expected,'Download projection differs from exact source registry representations')
 selected_by_work={row['work_id']:row for row in registry['selections']}
 require(len(selected_by_work)==len(registry['selections']),'Duplicate source work')
 require(set(selected_by_work)=={row['work_id'] for row in prior['selections']},'Retained selected work population changed')
 selections=[]
 for retained in prior['selections']:
  row=selected_by_work[retained['work_id']]
  work=row['work_id'];display_sha=row['display']['sha256'];target=destination/'selected-fronts'/(work+'.jpg')
  require(digest(target)==display_sha,'Existing selected display differs: '+work)
  selections.append({'work_id':work,'source_photograph_sha256':row['source_photograph_sha256'],'photo_role':'front','display':{'output_display_sha256':display_sha},'download':dict(row['download'])})
 require(len({s['work_id'] for s in selections})==len(selections),'Duplicate source work')
 require([selection_identity(s) for s in selections]==[selection_identity(s) for s in prior['selections']],'Structural migration must preserve exact retained photograph choices/order')
 binding={'repository':REPO,'revision':revision,'path':REGISTRY,'sha256':registry_sha}
 historical={k:v for k,v in prior.items() if k not in ('selections','unselected_work_ids','selection_registry')}
 projection=dict(prior,status='source_registry_display_projection',selection_registry=binding,selection_map_sha256=registry_sha,
  candidate_table_sha256=table_sha,recording_links=dict(registry['recording_links'],repository='main',revision=revision),
  selections=selections,unselected_work_ids=list(registry.get('unselected_work_ids',[])),historical_import=historical,
  historical_input_scope='Retained candidate/supplement/correction fields describe their original import; selection_registry identifies current authority.')
 save(destination/'data/selected-fronts.json',projection)
 (destination/'data/source-photo-selections.json').write_bytes(raw)
 downloads['selection_registry']=binding;save(destination/'data/photograph-downloads.json',downloads)
 path=destination/'assets/selected-fronts.js';code=path.read_text(encoding='utf-8')
 updates={'SELECTED_FRONTS_SHA256':digest(destination/'data/selected-fronts.json'),'PHOTO_SELECTION_REGISTRY_SHA256':registry_sha,'PHOTO_SELECTION_SOURCE_REVISION':revision}
 for key,value in updates.items():
  code,count=re.subn(r'(export const '+key+r' = ")[a-f0-9]+(";)',lambda m:m[1]+value+m[2],code)
  require(count==1,'Missing consumer constant: '+key)
 path.write_text(code,encoding='utf-8',newline='\n')
 path=destination/'assets/photograph-downloads.js';code=path.read_text(encoding='utf-8')
 code,count=re.subn(r'(export const PHOTOGRAPH_DOWNLOADS_SHA256 = ")[a-f0-9]+(";)',lambda m:m[1]+digest(destination/'data/photograph-downloads.json')+m[2],code)
 require(count==1,'Missing download constant')
 path.write_text(code,encoding='utf-8',newline='\n')
 tag='photo-selections-'+revision[:12]+'-'+registry_sha[:12]
 for relative in TEMPLATES:
  path=destination/relative;original=path.read_text(encoding='utf-8')
  changed=re.sub(r'((?:selected-fronts|photograph-downloads|app|drawing-archive)\.js)\?v=[A-Za-z0-9_-]+',lambda m:m[1]+'?v='+tag,original)
  if changed!=original:path.write_text(changed,encoding='utf-8',newline='\n')
 outputs={relative:{'sha256':digest(destination/relative),'size_bytes':(destination/relative).stat().st_size} for relative in sorted(PHOTO_OUTPUTS)}
 manifest={'contract':'browser_photo_selection_projection_v1','selection_registry':binding,'preserved_browser_revision':BROWSER_BASE,'preserved_prior_sha256':PRIOR_SHA256,
  'source_inputs':{relative:{'sha256':table_sha if relative==WORK_TABLE else digest(source/relative),'size_bytes':table_size if relative==WORK_TABLE else (source/relative).stat().st_size} for relative in SOURCE_PATHS},
  'outputs':outputs,'proof_scope':'JSON regenerated from pinned source and immutable prior metadata; generated constants/cache tags checked using current implementation templates. Source table identity is verified by hash/OID and size; its contents are not decoded by this exporter.'}
 save(destination/MANIFEST,manifest);validate_projection_manifest(manifest,destination)
 return {'status':'validated_local_not_published','works':len(selections),'selection_registry':binding,'all_existing_display_payloads_unchanged':True,'outputs':outputs}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);p.add_argument('--source-revision',required=True)
 a=p.parse_args();verify_source_checkout(a.source_root,a.source_revision)
 prior=subprocess.check_output(['git','-C',str(a.destination),'show',BROWSER_BASE+':data/selected-fronts.json'])
 print(json.dumps(export(a.source_root,a.destination,a.source_revision,prior),indent=2))
