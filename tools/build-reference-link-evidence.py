#!/usr/bin/env python3
"""Bind qualified-link support to pinned public premises; never change authority."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("Work_Identity/works.csv", "Work_Identity/work_record_links.csv",
           "Physical_References/work_reference_status.csv", "Physical_References/endpoint_references.csv",
           "Physical_References/Photographs/PROCESSING.json")
DERIVED = ("proposed", "deterministic_transitive_bridge", "derived_from_owner_confirmed_edges", "transitive_closure")
FIELDS = ("relationship_status", "evidence_class", "authority_class", "derivation_method")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def table(data):
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig")), strict=True))


def unique(rows, key):
    result = {}
    for row in rows:
        if row[key] in result:
            raise ValueError("Duplicate evidence identity: " + row[key])
        result[row[key]] = row
    return result


def build(lookup_bytes, inputs):
    lookup = json.loads(lookup_bytes)
    for path in SOURCES[:2]:
        if digest(inputs[path]) != lookup["sourceInputs"][path]["sha256"]:
            raise ValueError("Work-registry input differs from the pinned photograph lookup: " + path)
    active = {r["work_id"] for r in table(inputs[SOURCES[0]]) if r["status"] == "active"}
    links = unique(table(inputs[SOURCES[1]]), "record_id")
    statuses = unique(table(inputs[SOURCES[2]]), "work_id")
    references = unique(table(inputs[SOURCES[3]]), "reference_id")
    processing = unique(json.loads(inputs[SOURCES[4]])["successor_addition"]["records"], "sha256")
    photos = {p["sha256"]: p for e in lookup["records"].values()
              for p in [e["mainImage"], *e["additionalReferences"]] if p}
    supported = {}
    for sha, photo in sorted(photos.items()):
        wid, ref_id = photo["work_id"], photo["evidence_reference_id"]
        status, ref, receipt = statuses.get(wid), references.get(ref_id), processing.get(sha)
        if (tuple(photo[k] for k in FIELDS) != DERIVED or wid not in active or not status
                or status["relationship_status"] == "unresolved" or status["uncertainty_code"]
                or photo["source_binding_method"] not in {"exact_historical_reference_bytes", "provenance_bound_review_derivative"}
                or not ref or not receipt):
            continue
        link = links.get(ref["record_id"])
        # Check the actual two premises, not just the proposed/transitive labels.
        if (not link or link["work_id"] != wid or link["owner_confirmation_state"] != "owner_confirmed"
                or ref["owner_confirmation_state"] != "owner_confirmed_record_link"
                or not ref.get("owner_evidence", "").strip()
                or ref["relationship_type"] not in {"owner_confirmed_record_reference", "endpoint_photograph",
                                                     "two_sided_work_reference", "longitudinal_continuation"}
                or not re.fullmatch(r"[0-9a-f]{40}", ref["source_hub_revision"])
                or not re.fullmatch(r"[0-9a-f]{40}", link["source_hub_revision"])
                or len(ref["reference_image_sha256"]) != 64
                or any(c not in "0123456789abcdef" for c in ref["reference_image_sha256"])
                or receipt["work_id"] != wid or receipt["image_path"] != photo["image_path"]
                or receipt["source_binding_method"] != photo["source_binding_method"]
                or receipt["processing_method"] != photo["processing_method"]):
            continue
        supported[sha] = dict(workId=wid, referenceId=ref_id, bridgeRecordId=ref["record_id"],
                              sourcePhotographSha256=ref["reference_image_sha256"],
                              surfaceScope=ref["surface_scope"], caution=ref["caution"])
    return dict(schemaVersion=1, sourceRevision=lookup["sourceRevision"], lookupSha256=digest(lookup_bytes),
                sourceInputs={p: {"sha256": digest(inputs[p]), "bytes": len(inputs[p])} for p in SOURCES},
                images=supported)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = (ROOT / "data/physical-references.json").read_bytes()
    revision = json.loads(raw)["sourceRevision"]
    def fetch(path):
        url = f"https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/raw/{revision}/{path}"
        with urlopen(url, timeout=30) as response:
            return path, response.read(2_000_000)
    with ThreadPoolExecutor(max_workers=5) as pool:
        inputs = dict(pool.map(fetch, SOURCES))
    output = (json.dumps(build(raw, inputs), indent=2, ensure_ascii=False) + "\n").encode()
    target = ROOT / "data/reference-link-evidence.json"
    if args.check:
        if target.read_bytes() != output:
            raise SystemExit("Evidence snapshot differs from the pinned public premises")
        print("CHECK PASS: qualified-link evidence reproduces exactly")
    else:
        target.write_bytes(output)
        print(f"Bound {len(json.loads(output)['images'])} published photographs to checked public premises")


if __name__ == "__main__":
    main()
