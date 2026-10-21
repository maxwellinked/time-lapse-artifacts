"""Stage the public display projection from the canonical local candidate; no uploads."""
from pathlib import Path
import argparse, hashlib, json, io
import pyarrow.parquet as pq
from PIL import Image

def digest(b): return hashlib.sha256(b).hexdigest()

def export(candidate, destination, assets=False):
    source = candidate/'selected_fronts.json'
    selection = json.loads(source.read_bytes())
    table_path = candidate/'drawing_photographs.parquet'
    table_hash = digest(table_path.read_bytes())
    assert table_hash == selection['candidate_work_table']['sha256']
    rows = pq.read_table(table_path).to_pylist()
    by = {r['work_id']:r for r in rows}
    assert len(by) == len(rows) == len(selection['selections']) == 431
    public = []
    for item in selection['selections']:
        work = item['work_id']; row = by[work]; raw = row['image']['bytes']
        assert row['image']['path'] == work+'.jpg'
        assert digest(raw) == row['display_image_sha256'] == item['display']['output_display_sha256']
        assert row['source_photograph_sha256'] == item['source_photograph_sha256']
        assert item['photo_role'] == row['photo_role'] == 'front'
        assert 0 < len(raw) <= 524288
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            assert image.format == 'JPEG' and max(image.size)<=1024 and image.getexif().get(274,1)==1
        public.append({'work_id':work, 'source_photograph_sha256':item['source_photograph_sha256'],
                       'photo_role':'front', 'display':{'output_display_sha256':digest(raw)}})
        if assets:
            target=destination/'selected-fronts'/row['image']['path']; target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(raw)
    projection={'status':'derived_display_projection', 'revisions':selection['revisions'],
                'selection_map_sha256':digest(source.read_bytes()), 'candidate_table_sha256':table_hash,
                'recording_links':selection['recording_links'], 'selections':public}
    raw=(json.dumps(projection,indent=2)+'\n').encode()
    target=destination/'data'/'selected-fronts.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    return {'rows':len(public),'projection_sha256':digest(raw),'candidate_table_sha256':table_hash,
            'selection_map_sha256':projection['selection_map_sha256'],'assets_exported':assets}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate',type=Path,required=True); parser.add_argument('--destination',type=Path,required=True)
    parser.add_argument('--assets',action='store_true',help='Materialize exact embedded JPEGs; omit for the compact review package.')
    args=parser.parse_args();print(json.dumps(export(args.candidate,args.destination,args.assets),indent=2))
