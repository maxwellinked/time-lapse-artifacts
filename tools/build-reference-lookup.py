#!/usr/bin/env python3
"""Build an optional, source-bound Standard-recording photograph lookup.

The selection core is kept self-contained here and follows the public
recording/reference view contract. Only five HF text inputs and the pinned
GitHub index are read. No media, network, source edits or UI changes occur.
"""
from __future__ import annotations
import argparse
from collections import Counter
import csv
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import quote

REPOSITORY = "maxwellinked/time-lapse-artifacts"

PHOTO_MANIFEST = "Physical_References/Photographs/manifest.csv"

SOURCES = ("metadata.csv", "Pre_Standard_Time_Lapses/metadata.csv",
           "Work_Identity/works.csv", "Work_Identity/work_record_links.csv", PHOTO_MANIFEST)

CLARIFICATION = "Same registered work. The photograph does not establish this recording’s endpoint."

PHOTO_FIELDS = ("image_path", "sha256", "work_id", "image_role", "view_purpose", "width_px", "height_px",
                "encoded_width_px", "encoded_height_px", "orientation", "size_bytes", "relationship_status",
                "evidence_class", "authority_class", "derivation_method", "evidence_reference_id",
                "processing_spec", "processing_method", "source_binding_method", "inspection_resolution_class")

SELECTED_FIELDS = tuple(name for name in PHOTO_FIELDS if name != "work_id")

COLUMNS = ("video", "Physical reference photograph", "Reference role", "Pairing clarification",
           "Full-resolution photograph URL", "record_id", "work_id", "collection_tier", "selection_status",
           "source_hub_revision", "reference_count", "primary_reference_count") + SELECTED_FIELDS + ("additional_photographs",)

RID = re.compile(r"tla-[0-9a-f]{16}\Z")

WID = re.compile(r"tlaw-[0-9a-f]{16}\Z")

SHA = re.compile(r"[0-9a-f]{64}\Z")

PRIMARY_CLASSES = {"native_full_resolution_inspection": "native full drawing",
                   "limited_resolution_full_drawing_reference": "limited"}

class ContractError(ValueError):
    """An input or generated view violates the display contract."""

def require(ok: bool, message: str) -> None:
    if not ok:
        raise ContractError(message)

def table(data: bytes, label: str) -> tuple[list[str], list[dict[str, str]]]:
    try:
        reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig"), newline=""), strict=True)
        header = reader.fieldnames or []
        require(bool(header) and len(header) == len(set(header)), f"{label}: missing/duplicate columns")
        result = list(reader)
        require(all(None not in row and all(value is not None for value in row.values()) for row in result),
                f"{label}: malformed row")
        return header, result
    except (UnicodeError, csv.Error) as exc:
        raise ContractError(f"{label}: invalid UTF-8/CSV") from exc

def path_check(value: str, label: str) -> PurePosixPath:
    path = PurePosixPath(value)
    require(bool(value) and path.as_posix() == value and not path.is_absolute()
            and ".." not in path.parts and not any(c in value for c in "\\:%?#*[]")
            and not any(ord(c) < 32 for c in value), f"{label}: unsafe/noncanonical path")
    return path

def urls(path: str, revision: str) -> tuple[str, str]:
    return (f"hf://datasets/{REPOSITORY}@{revision}/{path}",
            f"https://huggingface.co/datasets/{REPOSITORY}/resolve/{revision}/{quote(path, safe='/')}")

def build_rows(inputs: dict[str, bytes], revision: str) -> list[dict[str, str | int]]:
    require(bool(re.fullmatch(r"[0-9a-f]{40}", revision)), "Full40hex source revision required")
    standard_header, standard = table(inputs[SOURCES[0]], SOURCES[0])
    pre_header, pre = table(inputs[SOURCES[1]], SOURCES[1])
    work_header, works = table(inputs[SOURCES[2]], SOURCES[2])
    link_header, links = table(inputs[SOURCES[3]], SOURCES[3])
    photo_header, photos = table(inputs[PHOTO_MANIFEST], PHOTO_MANIFEST)
    require(standard_header == pre_header and {"record_id", "file_name", "work_id", "collection_tier"} <= set(standard_header),
            "Recording indexes have incompatible/missing fields")
    require(tuple(photo_header) == PHOTO_FIELDS, "Public photograph schema changed; review required")
    require({"work_id", "status", "superseded_by_work_id"} <= set(work_header), "Work registry lacks required fields")
    require({"work_id", "record_id", "owner_confirmation_state", "source_hub_revision"} <= set(link_header),
            "Positive work-link registry lacks required fields")
    require(bool(standard or pre), "Recording indexes are empty")
    work_states = {}
    for work in works:
        wid = work.get("work_id", "")
        require(bool(WID.fullmatch(wid)) and wid not in work_states, "Invalid/duplicate work ID")
        require(work.get("status") in {"active", "superseded"}, "Unknown work status")
        successor = work.get("superseded_by_work_id", "")
        require((work["status"] == "active" and not successor) or
                (work["status"] == "superseded" and bool(WID.fullmatch(successor)) and successor != wid),
                "Invalid work retirement state")
        work_states[wid] = work["status"]
    require(all(not w.get("superseded_by_work_id") or work_states.get(w["superseded_by_work_id"]) == "active"
                for w in works), "Superseded work has no active successor")
    recordings, seen_paths = {}, set()
    ordered = []
    for tier, population in (("standard", standard), ("pre_standard", pre)):
        for row in population:
            rid, name = row["record_id"], row["file_name"]
            require(bool(RID.fullmatch(rid)) and rid not in recordings, "Invalid/duplicate recording ID")
            path = path_check(name, rid)
            require(path.suffix == ".mp4" and row["collection_tier"] == tier, "Wrong recording tier/extension")
            require((tier == "standard" and path.parent.as_posix() == "Standard_Time_Lapses") or
                    (tier == "pre_standard" and len(path.parts) == 1), "Recording path outside collection")
            full_path = name if tier == "standard" else "Pre_Standard_Time_Lapses/" + name
            require(full_path not in seen_paths, "Duplicate recording media path")
            require(not row["work_id"] or bool(WID.fullmatch(row["work_id"])), "Invalid projected work ID")
            seen_paths.add(full_path)
            recordings[rid] = row
            ordered.append((row, full_path))
    positive = {}
    for link in links:
        rid, wid = link.get("record_id", ""), link.get("work_id", "")
        require(rid in recordings and bool(WID.fullmatch(wid)), "Unknown record/invalid work link")
        require(link.get("owner_confirmation_state") == "owner_confirmed", "Unknown/nonpositive work confirmation state")
        require(work_states.get(wid) == "active", "Work link is not to an active registered work")
        require(rid not in positive, "Duplicate/conflicting work link")
        require(bool(re.fullmatch(r"[0-9a-f]{40}", link.get("source_hub_revision", ""))), "Invalid work-link source revision")
        positive[rid] = wid
    for row, _ in ordered:
        require(row["work_id"] == positive.get(row["record_id"], ""), "Metadata work-ID projection conflicts with positive registry")
    by_work, photo_paths, photo_hashes = {}, set(), set()
    for photo in photos:
        wid, name = photo["work_id"], photo["image_path"]
        require(work_states.get(wid) == "active", "Photograph is not linked to an active registered work")
        path_check(name, "photograph")
        require(bool(re.fullmatch(r"Physical_References/Photographs/images/tlaw-[0-9a-f]{16}/[0-9a-f]{24}\.jpg", name))
                and name.split("/")[3] == wid and bool(SHA.fullmatch(photo["sha256"]))
                and PurePosixPath(name).stem == photo["sha256"][:24], "Invalid photograph path/SHA binding")
        require(name not in photo_paths and photo["sha256"] not in photo_hashes, "Duplicate photograph path/bytes")
        photo_paths.add(name)
        photo_hashes.add(photo["sha256"])
        for key, expected in {"image_role": "drawing_reference", "relationship_status": "owner_confirmed",
                              "evidence_class": "direct_owner_confirmed", "authority_class": "owner_direct",
                              "derivation_method": "direct_confirmation", "processing_spec": "Physical_References/Photographs/PROCESSING.json"}.items():
            require(photo[key] == expected, f"Unknown photograph {key}")
        purpose, resolution = photo["view_purpose"], photo["inspection_resolution_class"]
        require((purpose == "primary_inspection" and resolution in PRIMARY_CLASSES) or
                (purpose == "supplemental_documentation" and resolution == "supplemental_documentation"),
                "Unknown/inconsistent photograph purpose or resolution")
        require(photo["source_binding_method"] in {"exact_confirmed_source_bytes", "inferred_same_capture_export_variant"},
                "Unknown photograph source-binding method")
        require(photo["processing_method"] in {"jpeg_metadata_only_codestream_unchanged", "embedded_primary_JPEG_codestream_and_ICC_preserved"},
                "Unknown photograph processing method")
        for key in ("width_px", "height_px", "encoded_width_px", "encoded_height_px", "orientation", "size_bytes"):
            require(bool(re.fullmatch(r"[1-9][0-9]*", photo[key])), "Invalid positive photograph integer")
        orientation = int(photo["orientation"])
        require(1 <= orientation <= 8, "Unknown photograph orientation")
        encoded = (photo["encoded_width_px"], photo["encoded_height_px"])
        require((photo["width_px"], photo["height_px"]) == (encoded[::-1] if orientation >= 5 else encoded),
                "Photograph display dimensions conflict with orientation")
        by_work.setdefault(wid, []).append(photo)
    result = []
    for record, media_path in ordered:
        wid = positive.get(record["record_id"], "")
        images = by_work.get(wid, [])
        primary = [p for p in images if p["view_purpose"] == "primary_inspection"]
        selected = None
        if len(primary) == 1:
            selected, status = primary[0], "primary_inspection"
        elif not primary and len(images) == 1:
            selected, status = images[0], "single_supplemental"
        elif images:
            status = "selection_unresolved"
        else:
            status = "missing_public_photo" if wid else "missing_work_link"
        extra = []
        for image in images:
            if image is not selected:
                hf_path, public_url = urls(image["image_path"], revision)
                extra.append(dict(image, hf_path=hf_path, image_url=public_url))
        # The video resolves within the configuration's containing repository
        # snapshot, as in the four original VideoFolder configurations.
        video = media_path
        image_path, public_url = urls(selected["image_path"], revision) if selected else ("", "")
        role = PRIMARY_CLASSES[selected["inspection_resolution_class"]] if selected and status == "primary_inspection" else "supplemental-only" if selected else "selection unresolved" if status == "selection_unresolved" else "missing"
        output = dict(zip(COLUMNS, [""] * len(COLUMNS)))
        output.update({"video": video, "Physical reference photograph": image_path, "Reference role": role,
                       "Pairing clarification": CLARIFICATION if selected else "", "Full-resolution photograph URL": public_url,
                       "record_id": record["record_id"], "work_id": wid, "collection_tier": record["collection_tier"],
                       "selection_status": status, "source_hub_revision": revision, "reference_count": len(images),
                       "primary_reference_count": len(primary), "additional_photographs": json.dumps(extra, ensure_ascii=False, separators=(",", ":"))})
        if selected:
            output.update({key: selected[key] for key in SELECTED_FIELDS})
        result.append(output)
    return result

def verified_inputs(root: Path, revision: str) -> dict[str, bytes]:
    """Bind the declared revision to exact text inputs, without media access."""
    require(bool(re.fullmatch(r"[0-9a-f]{40}", revision)), "Full40hex source revision required")
    root = root.resolve()
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0", GIT_LFS_SKIP_SMUDGE="1")

    def git(*args: str) -> bytes:
        try:
            command = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", str(root), *args]
            result = subprocess.run(command, capture_output=True, env=env, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ContractError("Pinned source Git objects are unavailable") from exc
        require(result.returncode == 0, "Pinned source Git objects are unavailable")
        return result.stdout

    require(Path(git("rev-parse", "--show-toplevel").decode("utf-8").strip()).resolve() == root,
            "--root must be an actual Git checkout root")
    require(git("cat-file", "-t", revision).strip() == b"commit", "Source revision must identify a commit")
    inputs = {}
    for name in SOURCES:  # Constant text-only allowlist; no media enumeration.
        path = root / name
        require(not path.is_symlink() and path.is_file() and path.stat().st_size <= 10 * 1024 * 1024,
                "Missing/nonordinary/oversize source text: " + name)
        current = path.read_bytes()
        committed = git("cat-file", "blob", revision + ":" + name)
        require(current == committed, "Current source bytes differ from pinned commit: " + name)
        inputs[name] = current
    return inputs

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def text_binding(path: str, data: bytes) -> dict:
    return dict(path=path, bytes=len(data), sha256=digest(data), gitBlobOid=git_blob(data))


def image_descriptor(row: dict) -> dict:
    """Keep public manifest fields verbatim; add links, never new photo IDs."""
    result = {name: row[name] for name in PHOTO_FIELDS}
    result["fullResolutionUrl"] = row["fullResolutionUrl"]
    result["hfPath"] = row["hfPath"]
    return result


def build_lookup(inputs: dict[str, bytes], source_revision: str, records_bytes: bytes,
                 github_revision: str) -> dict:
    require(bool(re.fullmatch(r"[0-9a-f]{40}", github_revision)), "Exact GitHub baseline commit required")
    paired = build_rows(inputs, source_revision)
    _, standard = table(inputs[SOURCES[0]], SOURCES[0])
    payload = json.loads(records_bytes)
    require(payload.get("sourceRepository") == REPOSITORY and payload.get("sourceRevision") == source_revision
            and payload.get("collection") == "Standard_Time_Lapses", "GitHub index source binding differs")
    github_records = payload.get("records")
    require(isinstance(github_records, list) and len(github_records) == len(standard), "GitHub Standard record count differs")
    expected_ids = {row["record_id"] for row in standard}
    seen = set()
    for record in github_records:
        require(isinstance(record, dict), "Invalid GitHub record")
        rid, index = record.get("recordId"), record.get("rowIndex")
        require(isinstance(rid, str) and rid in expected_ids and rid not in seen, "Unknown/duplicate GitHub record ID")
        require(type(index) is int and 0 <= index < len(standard), "Invalid GitHub source row index")
        source = standard[index]
        require(source["record_id"] == rid, "GitHub row index joins a different recording")
        _, video_url = urls(source["file_name"], source_revision)
        require(record.get("filename") == PurePosixPath(source["file_name"]).name
                and record.get("videoUrl") == record.get("sourceUrl") == video_url,
                "GitHub recording path or pinned source URL differs")
        require(bool(SHA.fullmatch(source.get("hub_xet_hash", "")))
                and record.get("integrityReference") == source["hub_xet_hash"], "GitHub recording integrity identity differs")
        seen.add(rid)
    require(seen == expected_ids, "GitHub index does not contain exact Standard membership")
    records = {}
    for row in paired:
        if row["collection_tier"] != "standard":
            continue
        main = None
        if row["image_path"]:
            main = image_descriptor(dict(row, fullResolutionUrl=row["Full-resolution photograph URL"],
                                         hfPath=row["Physical reference photograph"]))
        additional = [image_descriptor(dict(extra, fullResolutionUrl=extra["image_url"], hfPath=extra["hf_path"]))
                      for extra in json.loads(row["additional_photographs"])]
        records[row["record_id"]] = dict(workId=row["work_id"], selectionStatus=row["selection_status"],
            referenceRole=row["Reference role"], clarification=row["Pairing clarification"],
            referenceCount=row["reference_count"], primaryReferenceCount=row["primary_reference_count"],
            mainImage=main, additionalReferences=additional)
    require(set(records) == expected_ids, "Lookup dropped or manufactured Standard recording IDs")
    return dict(schemaVersion=1, sourceRepository=REPOSITORY, sourceRevision=source_revision,
                githubRevision=github_revision,
                sourceInputs={name: text_binding(name, inputs[name]) for name in SOURCES},
                githubRecords=text_binding("data/records.json", records_bytes),
                counts=dict(records=len(records), pairedRecords=sum(v["mainImage"] is not None for v in records.values()),
                            nullRecords=sum(v["mainImage"] is None for v in records.values()),
                            selectionStatuses=dict(Counter(v["selectionStatus"] for v in records.values())),
                            referenceRoles=dict(Counter(v["referenceRole"] for v in records.values()))),
                records=records)


def pinned_github_records(root: Path, revision: str, records_path: Path) -> bytes:
    require(bool(re.fullmatch(r"[0-9a-f]{40}", revision)), "Exact GitHub baseline commit required")
    root = root.resolve()
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0", GIT_LFS_SKIP_SMUDGE="1")
    def git(*args):
        try:
            result = subprocess.run(["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", str(root), *args],
                                    capture_output=True, env=env, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ContractError("GitHub baseline Git objects unavailable") from exc
        require(result.returncode == 0, "GitHub baseline Git objects unavailable")
        return result.stdout
    require(Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve() == root,
            "GitHub baseline must be an actual Git checkout root")
    require(git("cat-file", "-t", revision).strip() == b"commit", "GitHub baseline must identify a commit")
    require(not records_path.is_symlink() and records_path.is_file() and records_path.stat().st_size <= 10 * 1024 * 1024,
            "GitHub records input is missing/nonordinary/oversize")
    current = records_path.read_bytes()
    require(current == git("cat-file", "blob", revision + ":data/records.json"),
            "Copied GitHub records bytes differ from baseline commit")
    return current


def render_lookup(lookup: dict) -> bytes:
    return (json.dumps(lookup, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path, help="HF Git checkout; five text inputs must match source revision")
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--github-root", required=True, type=Path, help="GitHub baseline Git checkout/object store")
    parser.add_argument("--github-revision", required=True)
    parser.add_argument("--records", required=True, type=Path, help="Existing site data/records.json; read-only")
    parser.add_argument("--output", required=True, type=Path, help="Derived data/physical-references.json")
    parser.add_argument("--check", action="store_true", help="Check exact deterministic bytes without writing")
    args = parser.parse_args()
    try:
        output, records_path = args.output.resolve(), args.records.resolve()
        source_root, github_root = args.source_root.resolve(), args.github_root.resolve()
        protected = {(source_root / name).resolve() for name in SOURCES} | {records_path, (github_root / "data/records.json").resolve()}
        require(output not in protected and output.name == "physical-references.json", "Output would overwrite authority or has wrong name")
        for checkout in {source_root, github_root}:
            require(not output.is_relative_to(checkout) or output == checkout / "data/physical-references.json",
                    "Within a source checkout only data/physical-references.json may be written")
        inputs = verified_inputs(source_root, args.source_revision)
        records_bytes = pinned_github_records(github_root, args.github_revision, records_path)
        result = render_lookup(build_lookup(inputs, args.source_revision, records_bytes, args.github_revision))
        if args.check:
            require(output.is_file() and output.read_bytes() == result, "Reference lookup is missing/stale")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(result)
        print("CHECK PASS" if args.check else "WROTE", output)
        return 0
    except (ContractError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("FAIL:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
