#!/usr/bin/env python3
"""Export the site's existing work grouping as a small, self-contained HF view.

Requires Node, Git, pyarrow and Pillow. Reads exact Git objects, never private
originals. No uploads or authority edits. Embedded images retain existing bytes.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.request import urlopen

import pyarrow as pa
import pyarrow.parquet as pq
from PIL import Image, ImageOps


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(root, revision, output):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Use an exact site commit SHA")

    def git_file(path):
        return subprocess.check_output(["git", "-C", str(root), "show", f"{revision}:{path}"])

    # A current selected-front projection must not be rebuilt from historical eligibility.
    selected_map = subprocess.run(["git", "-C", str(root), "cat-file", "-e",
                                   f"{revision}:data/selected-fronts.json"],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if selected_map.returncode == 0:
        raise ValueError("This revision uses the common selected-front map. Export from its canonical embedded table, not the historical source-lookup policy.")

    inputs = ("assets/drawing-archive-model.js", "assets/reference-policy.js",
              "data/records.json", "data/physical-references.json", "reference-previews/manifest.json")
    input_hashes = {}
    with tempfile.TemporaryDirectory() as temporary:
        stage = Path(temporary)
        (stage / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        for path in inputs:
            content = git_file(path)
            input_hashes[path] = digest(content)
            destination = stage / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        code = """
import fs from 'node:fs';
import {buildDrawingArchive} from './assets/drawing-archive-model.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const data=read('data/records.json');
console.log(JSON.stringify({sourceRevision:data.sourceRevision,
  works:buildDrawingArchive(data,read('data/physical-references.json'),read('reference-previews/manifest.json'))}));
"""
        result = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", code], cwd=stage))

    rows = []
    for work in result["works"]:
        image = None
        if work["photograph"]:
            url = work["displayUrl"]
            if url.startswith("reference-previews/"):
                content = git_file(url)
            else:
                expected = f'https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/{result["sourceRevision"]}/Physical_References/Photographs/images/'
                if not url.startswith(expected):
                    raise ValueError("Unexpected photograph URL")
                with urlopen(url, timeout=60) as response:
                    content = response.read(512 * 1024 + 1)
            if not 0 < len(content) <= 512 * 1024 or digest(content) != work["displaySha256"]:
                raise ValueError(f'Photograph size/hash mismatch: {work["workId"]}')
            with Image.open(io.BytesIO(content)) as opened:
                opened.load()
                if opened.format != "JPEG" or max(ImageOps.exif_transpose(opened).size) > 1024:
                    raise ValueError(f'Photograph format/dimensions mismatch: {work["workId"]}')
            image = {"bytes": content, "path": f'{work["workId"]}.jpg'}
        rows.append({"image": image, "work_id": work["workId"], "photograph_status": work["status"],
                     "recording_count": len(work["records"]),
                     "recording_ids": [record["recordId"] for record in work["records"]],
                     "source_photograph_sha256": work["photograph"]["sha256"] if image else None,
                     "display_image_sha256": work["displaySha256"]})

    string_feature = {"dtype": "string", "_type": "Value"}
    features = {"image": {"_type": "Image"}, "work_id": string_feature,
                "photograph_status": string_feature,
                "recording_count": {"dtype": "int64", "_type": "Value"},
                "recording_ids": [string_feature], "source_photograph_sha256": string_feature,
                "display_image_sha256": string_feature}
    schema = pa.schema([
        ("image", pa.struct([("bytes", pa.binary()), ("path", pa.string())])),
        ("work_id", pa.string()), ("photograph_status", pa.string()),
        ("recording_count", pa.int64()), ("recording_ids", pa.list_(pa.string())),
        ("source_photograph_sha256", pa.string()), ("display_image_sha256", pa.string()),
    ], metadata={b"huggingface": json.dumps({"info": {"features": features}}).encode()})
    table = pa.Table.from_pylist(rows, schema=schema)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Finish and verify a temporary file before replacing an existing export.
    with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
        staged = Path(temporary) / output.name
        pq.write_table(table, staged, compression="zstd")
        if pq.read_table(staged).to_pylist() != rows:
            raise ValueError("Parquet round-trip mismatch")
        staged.replace(output)
    manifest = {"siteRevision": revision, "sourceHubRevision": result["sourceRevision"],
                "inputSha256": input_hashes, "rows": len(rows),
                "statusCounts": dict(Counter(row["photograph_status"] for row in rows)),
                "recordings": sum(row["recording_count"] for row in rows),
                "imageLongEdgeLimit": 1024, "imageByteLimit": 512 * 1024,
                "imagePolicy": "Same strict primary display policy as the pinned site; no new confirmations",
                "pyarrowVersion": pa.__version__, "outputSha256": digest(output.read_bytes()),
                "outputBytes": output.stat().st_size}
    output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.root, args.revision, args.output)
