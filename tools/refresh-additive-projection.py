#!/usr/bin/env python3
"""Prepare/check an additive, immutable-source browser refresh; never publish.

Reads Git text/pointer objects only. Existing recording semantics, registered
works and photograph selections must remain unchanged. Added recordings must
have blank work IDs. Generate their previews/anchors separately, then run the
full site validator. --check compares deterministic projection bytes only.
"""
import argparse
import base64
from collections import Counter
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import os
import shutil
import tempfile
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M = load("refresh_migration", "migrate-media-names.py")
LOOKUP = load("refresh_lookup", "build-reference-lookup.py")
EVIDENCE = load("refresh_evidence", "build-reference-link-evidence.py")


def retain_corrected_lookup(refs, inputs, metadata_by_id, old_ids, added_ids, revision, source_bytes):
    """Retain the committed corrected view; raw historical photos are not rebuilt.

    The source photograph manifest can legitimately retain superseded evidence.
    Its original validator remains strict. This additive operation requires its
    bytes, work registries and pre-Standard index to be unchanged, validates the
    retained active entries and correction receipts, and adds only empty rows.
    """
    M.require(set(refs["records"]) == set(old_ids), "Baseline lookup membership differs")
    for path in LOOKUP.SOURCES:
        if path == "metadata.csv":
            continue
        binding = refs["sourceInputs"][path]
        M.require(M.digest(inputs[path]) == binding["sha256"] and len(inputs[path]) == binding["bytes"],
                  "Existing lookup source changed; separate relationship review required: " + path)
    works = list(csv.DictReader(io.StringIO(inputs["Work_Identity/works.csv"].decode("utf-8-sig"))))
    links = list(csv.DictReader(io.StringIO(inputs["Work_Identity/work_record_links.csv"].decode("utf-8-sig"))))
    M.require(len({r["work_id"] for r in works}) == len(works), "Duplicate registered work")
    M.require(len({r["record_id"] for r in links}) == len(links), "Duplicate positive work link")
    active = {r["work_id"] for r in works if r["status"] == "active"}
    positive = {r["record_id"]: r["work_id"] for r in links}
    M.require(all(r["owner_confirmation_state"] == "owner_confirmed" and r["work_id"] in active for r in links),
              "Positive work registry is not owner-confirmed and active")
    correction = refs.get("workIdentityCorrection")
    M.require(isinstance(correction, dict), "Retained creator correction is missing")
    for name in ("ledger", "confirmation"):
        binding = correction[name]
        raw = source_bytes(M.safe_path(binding["path"]))
        M.require(M.digest(raw) == binding["sha256"] and len(raw) == binding["bytes"],
                  "Retained creator correction evidence changed: " + name)
    M.require(correction["survivor_work_id"] in active and correction["superseded_work_id"] not in active,
              "Creator-correction registry state differs")
    for name in ("donor_record_id", "affected_record_id"):
        M.require(refs["records"][correction[name]]["workId"] == correction["survivor_work_id"],
                  "Corrected record lost its survivor work")
    retained = copy.deepcopy(refs["records"])
    verified = set()
    for rid, entry in retained.items():
        if entry["workId"] == "":
            M.require(metadata_by_id[rid].get("work_id") == "" and rid not in positive
                      and entry.get("selectionStatus") == "missing_work_link"
                      and entry.get("referenceRole") == "missing"
                      and entry.get("clarification") == ""
                      and entry.get("referenceCount") == 0 and entry.get("primaryReferenceCount") == 0
                      and entry.get("mainImage") is None and entry.get("additionalReferences") == [],
                      "Retained unlinked recording-to-work authority differs: " + rid)
            continue
        M.require(entry["workId"] in active and entry["workId"] == metadata_by_id[rid]["work_id"] == positive.get(rid),
                  "Retained recording-to-work authority differs: " + rid)
        for image in [entry.get("mainImage"), *entry["additionalReferences"]]:
            if not image:
                continue
            M.require(image["work_id"] == entry["workId"], "Retained photograph has another work")
            LOOKUP.validate_photo_path(image)
            if image["image_path"] not in verified:
                identity = M.object_identity(source_bytes(image["image_path"]))
                M.require(identity == (image["sha256"], int(image["size_bytes"])), "Retained photograph object changed")
                verified.add(image["image_path"])
        if entry.get("mainImage"):
            entry["mainImage"] = M.migrate_descriptor(entry["mainImage"], {}, revision)
        entry["additionalReferences"] = [M.migrate_descriptor(p, {}, revision) for p in entry["additionalReferences"]]
    for rid in added_ids:
        M.require(metadata_by_id[rid]["work_id"] == "" and rid not in positive,
                  "Added recording acquired an established work link: " + rid)
        retained[rid] = dict(workId="", selectionStatus="missing_work_link", referenceRole="missing", clarification="",
                             referenceCount=0, primaryReferenceCount=0, mainImage=None, additionalReferences=[])
    counts = dict(records=len(retained), pairedRecords=sum(r["mainImage"] is not None for r in retained.values()),
                  nullRecords=sum(r["mainImage"] is None for r in retained.values()),
                  selectionStatuses=dict(Counter(r["selectionStatus"] for r in retained.values())),
                  referenceRoles=dict(Counter(r["referenceRole"] for r in retained.values())))
    return retained, counts


def retain_qualified_evidence(evidence, old_lookup_bytes, retained_entries, inputs):
    """Keep hash-bound historical premises when every cited input is unchanged."""
    M.require(evidence["lookupSha256"] == M.digest(old_lookup_bytes), "Baseline qualified-evidence lookup binding differs")
    for path in EVIDENCE.SOURCES:
        binding = evidence["sourceInputs"][path]
        M.require(M.digest(inputs[path]) == binding["sha256"] and len(inputs[path]) == binding["bytes"],
                  "Qualified photograph premise input changed: " + path)
    photos = {p["sha256"]: p for entry in retained_entries.values()
              for p in [entry.get("mainImage"), *entry["additionalReferences"]] if p}
    for sha256, proof in evidence["images"].items():
        image = photos.get(sha256)
        M.require(image and image["relationship_status"] == "proposed" and image["work_id"] == proof["workId"]
                  and image["evidence_reference_id"] == proof["referenceId"],
                  "Retained qualified proof no longer binds the published photograph")
    return copy.deepcopy(evidence)


def project_records(raw, revision, generated_at):
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    records = []
    for index, row in enumerate(rows):
        if not (row["is_canonical"].lower() == "true" and row["collection_tier"] == "standard"
                and row["file_name"].startswith("Standard_Time_Lapses/") and row["file_name"].lower().endswith(".mp4")):
            continue
        for field in ("file_name", "record_id", "date", "tool", "medium", "support", "dimensions",
                      "duration_seconds", "orientation", "acquisition_protocol_version", "hub_xet_hash"):
            M.require(row.get(field), "Required canonical field is blank: " + field)
        M.require(re.fullmatch(r"tla-[a-f0-9]{16}", row["record_id"]), "Invalid record ID")
        M.require(M.HEX64.fullmatch(row["hub_xet_hash"]), "Missing/invalid accepted Hub identity")
        M.require(row.get("recording_mode", "time_lapse") == "time_lapse", "Invalid recording mode")
        duration = float(row["duration_seconds"])
        M.require(0 < duration < float("inf"), "Invalid encoded duration")
        url = M.BASE_URL + "/resolve/" + revision + "/" + quote(M.safe_path(row["file_name"]), safe="/")
        records.append(dict(recordId=row["record_id"], rowIndex=index, videoUrl=url, sourceUrl=url,
                            filename=Path(row["file_name"]).name, date=row["date"], time=row["time"] or None,
                            tool=row["tool"], medium=row["medium"], support=row["support"], dimensions=row["dimensions"],
                            durationSeconds=int(duration) if duration.is_integer() else duration,
                            orientation=row["orientation"], recordingMode=row.get("recording_mode", "time_lapse"),
                            captureType=row["acquisition_protocol_version"], integrityReference=row["hub_xet_hash"]))
    M.require(records and all(len({r[key] for r in records}) == len(records)
                             for key in ("recordId", "videoUrl", "integrityReference")), "Duplicate canonical identity")
    records.sort(key=lambda r: r["date"] + "T" + (r["time"] or "00:00"), reverse=True)
    return dict(generatedAt=generated_at, sourceRepository=M.REPOSITORY, sourceRevision=revision,
                collection="Standard_Time_Lapses", records=records)


def project_sequence_insertions(source, revision, records):
    """Use the shared JS source consumer against exact Git objects, without media IO."""
    registry = "Standard_Time_Lapses/Provenance/Sequence_Insertions/registry.json"
    exists = subprocess.check_output(["git", "ls-tree", revision, "--", registry], cwd=source).strip()
    if not exists:
        M.require(not any(re.search(r"\.Rec\d{2,}[a-z]+\.mp4$", r["filename"], re.I)
                          for r in records["records"]), "Insertion records require an authoritative projection registry")
        return None
    node = os.environ.get("NODE_EXECUTABLE") or shutil.which("node")
    M.require(node, "Node is required to validate the authoritative insertion registry")
    with tempfile.TemporaryDirectory(prefix="tla-sequence-projection-") as directory:
        records_path = Path(directory) / "records.json"
        output_path = Path(directory) / "sequence-insertions.json"
        records_path.write_bytes(M.json_bytes(records))
        try:
            subprocess.run([node, str(ROOT / "tools/sync-sequence-insertions.mjs"),
                            "--records", str(records_path), "--source-root", str(source),
                            "--output", str(output_path)], check=True, capture_output=True)
        except subprocess.CalledProcessError as error:
            raise ValueError("Sequence insertion projection failed: " + error.stderr.decode("utf-8", errors="replace")) from error
        return output_path.read_bytes()


def prepare_real_time_refresh(previous, source_bytes, records, expected_additions):
    """Validate an explicit append scope and render it with the existing JS consumer."""
    M.require(type(expected_additions) is int and expected_additions >= 0,
              "Invalid real-time addition count")
    previous_manifest = json.loads(previous["manifest.json"])
    for name in ("metadata.csv", "SHA256SUMS"):
        binding = previous_manifest["inputs"]["Real_Time_Recordings/" + name]
        M.require(M.digest(previous[name]) == binding["sha256"] and len(previous[name]) == binding["sizeBytes"],
                  "Real-time baseline source binding differs: " + name)
    paths = ["Real_Time_Recordings/" + name for name in
             ("metadata.csv", "SHA256SUMS", "README.md", "SCHEMA.md")]
    inputs = {path: source_bytes(path) for path in paths}
    csv_bytes, sums_bytes = inputs[paths[0]], inputs[paths[1]]
    M.require(previous["metadata.csv"].endswith(b"\n") and csv_bytes.startswith(previous["metadata.csv"]),
              "Retained real-time CSV bytes changed; only appended rows are permitted")
    current_lines = sums_bytes.splitlines(keepends=True)
    M.require(all(line in current_lines for line in previous["SHA256SUMS"].splitlines(keepends=True)),
              "Retained real-time checksum entry changed")
    before = list(csv.DictReader(io.StringIO(previous["metadata.csv"].decode("utf-8-sig"))))
    after = list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8-sig"))))
    M.require(len(after) == len(before) + expected_additions,
              "Real-time recording population is not the approved addition scope")
    manifest = dict(sourceRepository=M.REPOSITORY, sourceRevision=records["sourceRevision"],
                    inputs={path: dict(sha256=M.digest(value), sizeBytes=len(value))
                            for path, value in inputs.items()})
    node = os.environ.get("NODE_EXECUTABLE") or shutil.which("node")
    M.require(node, "Node is required to validate the real-time projection")
    # Reuse the public validator and renderer; no second numeric/path contract.
    bridge = """
import {readFileSync} from 'node:fs';
const {buildRealTimeProjection,buildRealTimePage}=await import(process.argv[2]);
const input=JSON.parse(readFileSync(process.argv[1],'utf8'));
const payload=buildRealTimeProjection(input.records,{manifest:input.manifest,
 csv:Buffer.from(input.csv,'base64'),sums:Buffer.from(input.sums,'base64')});
const encoded=s=>Buffer.from(s).toString('base64');
console.log(JSON.stringify({files:{'data/real-time-recordings.json':encoded(JSON.stringify(payload,null,2)+'\\n'),
 'real-time-recordings.html':encoded(buildRealTimePage(payload,input.records))}}));
"""
    with tempfile.TemporaryDirectory(prefix="tla-realtime-projection-") as directory:
        input_path = Path(directory) / "input.json"
        input_path.write_bytes(M.json_bytes(dict(records=records, manifest=manifest,
            csv=base64.b64encode(csv_bytes).decode(), sums=base64.b64encode(sums_bytes).decode())))
        result = subprocess.run([node, "--input-type=module", "--eval", bridge, str(input_path),
                                 (ROOT / "tools/build-real-time-recordings.mjs").as_uri()],
                                capture_output=True, check=False)
        M.require(result.returncode == 0,
                  "Real-time projection validation failed: " + result.stderr.decode("utf-8", errors="replace"))
        outputs = {path: base64.b64decode(value) for path, value in json.loads(result.stdout)["files"].items()}
    added = after[len(before):]
    for row in added:
        M.require(M.object_identity(source_bytes(row["file_name"])) == (row["sha256"], int(row["size_bytes"])),
                  "Added real-time source payload identity differs: " + row["record_id"])
    outputs.update({"data/real-time-source/metadata.csv": csv_bytes,
                    "data/real-time-source/SHA256SUMS": sums_bytes,
                    "data/real-time-source/manifest.json": M.json_bytes(manifest)})
    receipt = dict(previousRecords=len(before), records=len(after), addedCount=len(added),
                   addedRecords=[row["record_id"] for row in added],
                   existingRows="byte_identical_prefix", existingChecksums="unchanged_lines",
                   previousSourceInputs=previous_manifest["inputs"], sourceInputs=manifest["inputs"])
    return outputs, receipt


def refresh(source, revision, browser, baseline, generated_at, expected_additions,
            expected_real_time_additions=None):
    M.require(M.HEX40.fullmatch(revision) and M.HEX40.fullmatch(baseline), "Exact immutable revisions required")
    M.require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", generated_at), "Explicit generation date required")
    M.require(expected_additions > 0, "Explicit positive addition count required")
    def raw(path): return M.git_bytes(browser, baseline, path)
    def read(path): return json.loads(raw(path))
    def source_bytes(path): return M.git_bytes(source, revision, path)
    def bind(path): return dict(**LOOKUP.text_binding(path, source_bytes(path)), revision=revision)
    outputs = {}
    previous = read("data/records.json")
    source_metadata = source_bytes("metadata.csv")
    records = project_records(source_metadata, revision, generated_at)
    old = {r["recordId"]: r for r in previous["records"]}
    current = {r["recordId"]: r for r in records["records"]}
    added = sorted(set(current) - set(old))
    M.require(set(old) <= set(current) and len(added) == expected_additions, "Recording population is not the approved additive scope")
    for rid, before in old.items():
        expected = copy.deepcopy(before)
        for field in ("sourceUrl", "videoUrl"):
            expected[field] = M.media_url(expected[field], {}, revision)
        M.require(current[rid] == expected, "Existing recording semantics changed: " + rid)
    metadata_by_id = {r["record_id"]: r for r in csv.DictReader(io.StringIO(source_metadata.decode("utf-8-sig")))}
    sums = {}
    for line in source_bytes("SHA256SUMS").decode("utf-8").splitlines():
        match = re.fullmatch(r"([a-f0-9]{64}) [ *](.+)", line)
        M.require(match and match[2] not in sums, "Malformed/duplicate source checksum")
        sums[match[2]] = match[1]
    for rid in added:
        row = metadata_by_id[rid]
        M.require(row.get("work_id") == "", "Added recording must retain a blank work ID")
        # Git LFS pointer identity is sufficient; no media fetch/decode occurs.
        identity = M.object_identity(source_bytes(row["file_name"]))
        M.require(identity == (sums.get(row["file_name"]), int(row["size_bytes"])), "Added source payload identity differs: " + rid)
    outputs["data/records.json"] = M.json_bytes(records)
    sequence_projection = project_sequence_insertions(source, revision, records)
    if sequence_projection is not None:
        outputs["data/sequence-insertions.json"] = sequence_projection

    inputs = {p: source_bytes(p) for p in LOOKUP.SOURCES}
    refs = read("data/physical-references.json")
    prior_metadata = M.git_bytes(source, refs["sourceInputs"]["metadata.csv"].get("revision", refs["sourceRevision"]), "metadata.csv")
    M.require(M.digest(prior_metadata) == refs["sourceInputs"]["metadata.csv"]["sha256"], "Prior source metadata binding differs")
    prior_rows = list(csv.DictReader(io.StringIO(prior_metadata.decode("utf-8-sig"))))
    M.require({r["record_id"] for r in prior_rows} == set(old), "Prior source and browser membership differ")
    M.require(all(metadata_by_id.get(r["record_id"]) == r for r in prior_rows), "Existing complete source metadata row changed")
    M.require(refs["currentRecords"]["sha256"] == M.digest(raw("data/records.json")), "Baseline current-record binding differs")
    retained, counts = retain_corrected_lookup(refs, inputs, metadata_by_id, old, added, revision, source_bytes)
    # Keep all historical correction, migration and initial snapshot evidence.
    refs.update(sourceRevision=revision, sourceInputs={p: bind(p) for p in LOOKUP.SOURCES},
                counts=counts, records=retained,
                currentRecords=LOOKUP.text_binding("data/records.json", outputs["data/records.json"]))
    outputs["data/physical-references.json"] = LOOKUP.render_lookup(refs)
    evidence_inputs = {p: source_bytes(p) for p in EVIDENCE.SOURCES}
    evidence = retain_qualified_evidence(read("data/reference-link-evidence.json"),
        raw("data/physical-references.json"), retained, evidence_inputs)
    evidence.update(sourceRevision=revision, lookupSha256=M.digest(outputs["data/physical-references.json"]),
                    sourceInputs={p: bind(p) for p in EVIDENCE.SOURCES})
    outputs["data/reference-link-evidence.json"] = M.json_bytes(evidence)
    selected = read("data/selected-fronts.json")
    selected["recording_links"] = {**selected["recording_links"], **bind("Work_Identity/work_record_links.csv")}
    outputs["data/selected-fronts.json"] = M.json_bytes(selected)
    # Photograph downloads have their own retained media revisions, unchanged.
    preview = read("previews/manifest.json")
    M.require(preview["generationVersion"] == 2, "Preview cache migration needs separate review")
    preview.update(sourceRevision=revision, records=len(current),
                   recordIdentities={r["recordId"]: r["integrityReference"] for r in records["records"]})
    outputs["previews/manifest.json"] = M.json_bytes(preview)
    for path in ("reference-previews/manifest.json", "assets/visual-anchors/manifest.json"):
        manifest = read(path)
        manifest["sourceRevision"] = revision
        for image in manifest.get("images", {}).values():
            for field in ("sourceUrl", "sourcePath"):
                if image.get(field, "").startswith(M.BASE_URL + "/resolve/"):
                    image[field] = M.media_url(image[field], {}, revision)
        outputs[path] = M.json_bytes(manifest)
    real_time_receipt = None
    if expected_real_time_additions is not None:
        previous_rt = {name: raw("data/real-time-source/" + name)
                       for name in ("metadata.csv", "SHA256SUMS", "manifest.json")}
        rt_outputs, real_time_receipt = prepare_real_time_refresh(
            previous_rt, source_bytes, records, expected_real_time_additions)
        outputs.update(rt_outputs)
    else:
        # Preserve the exact historical reproduction contract of earlier receipts.
        realtime = dict(sourceRepository=M.REPOSITORY, sourceRevision=revision, inputs={})
        for path in ("Real_Time_Recordings/metadata.csv", "Real_Time_Recordings/SHA256SUMS",
                     "Real_Time_Recordings/README.md", "Real_Time_Recordings/SCHEMA.md"):
            value = source_bytes(path)
            realtime["inputs"][path] = dict(sha256=M.digest(value), sizeBytes=len(value))
            if path.endswith(".csv") or path.endswith("SHA256SUMS"):
                M.require(value == raw("data/real-time-source/" + path.rsplit("/", 1)[-1]), "Real-time source values changed")
                outputs["data/real-time-source/" + path.rsplit("/", 1)[-1]] = value
        outputs["data/real-time-source/manifest.json"] = M.json_bytes(realtime)
    # Use the reviewed working-code changes; the historical snapshot is data authority.
    for path in ("assets/selected-fronts.js", "assets/app.js", "assets/drawing-archive.js", "index.html", "drawings.html"):
        text = (browser / path).read_text(encoding="utf-8")
        if path == "assets/selected-fronts.js":
            for constant, target in (("SELECTED_FRONTS_SHA256", "data/selected-fronts.json"),
                                     ("LEGACY_REFERENCE_SHA256", "data/physical-references.json")):
                text, count = re.subn(r'(' + constant + r' = ")[a-f0-9]{64}(";)',
                                     lambda m: m[1] + M.digest(outputs[target]) + m[2], text)
                M.require(count == 1, "Projection hash gate missing")
        text = M.migrate_cache_tokens(text, revision).replace("media-names-" + revision, "source-refresh-" + revision)
        outputs[path] = text.encode("utf-8")
    outputs["data/source-refresh.json"] = M.json_bytes(dict(schemaVersion=1, sourceRepository=M.REPOSITORY,
        sourceRevision=revision, previousSourceRevision=previous["sourceRevision"], browserBase=baseline,
        generatedAt=generated_at, previousRecords=len(old), records=len(current), addedRecords=added,
        addedCount=len(added), unlinkedAddedCount=len(added), existingRelationships="unchanged",
        historicalMigration="retained", metadata=bind("metadata.csv")))
    if real_time_receipt is not None:
        receipt = json.loads(outputs["data/source-refresh.json"])
        receipt["realTime"] = real_time_receipt
        outputs["data/source-refresh.json"] = M.json_bytes(receipt)
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--browser-root", type=Path, default=ROOT)
    parser.add_argument("--browser-base", required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--expected-additions", type=int, required=True)
    parser.add_argument("--expected-real-time-additions", type=int,
                        help="Explicit append-only MOV count; omission retains the legacy no-change guard")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = refresh(args.source_root, args.source_revision, args.browser_root, args.browser_base,
                      args.generated_at, args.expected_additions, args.expected_real_time_additions)
    for path, value in outputs.items():
        target = args.output / path
        if args.check:
            M.require(target.read_bytes() == value, "Stale additive projection: " + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(value)
    print(json.dumps(dict(status="checked" if args.check else "prepared", files=len(outputs), publication="not_performed")))


if __name__ == "__main__":
    main()
