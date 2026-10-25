#!/usr/bin/env python3
"""Prepare a bounded browser projection from a committed HF filename migration.

Only reference strings and input bindings change. Local display/preview/anchor
objects and historical correction/selection receipts are retained byte-for-byte.
The default writes candidate files to --output; it never publishes either repo.
"""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
from urllib.parse import quote, unquote, urlsplit

REPOSITORY = "maxwellinked/time-lapse-artifacts"
BASE_URL = f"https://huggingface.co/datasets/{REPOSITORY}"
HEX40 = re.compile(r"[a-f0-9]{40}")
HEX64 = re.compile(r"[a-f0-9]{64}")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(value):
    require(isinstance(value, str) and value and not any(c in value for c in "\\\r\n\0:"), "Unsafe media path")
    path = PurePosixPath(value)
    require(not path.is_absolute() and all(p not in {"", ".", ".."} for p in value.split("/"))
            and path.as_posix() == value, "Unsafe media path")
    return value


def mapping_index(rows):
    result, destinations = {}, set()
    for row in rows:
        old, new = safe_path(row["old_path"]), safe_path(row["new_path"])
        require(old != new and old not in result and new not in destinations, "Duplicate or unchanged media mapping")
        require(HEX64.fullmatch(row["sha256"]) and HEX40.fullmatch(row["base_revision"]), "Invalid source identity")
        require(str(row["size_bytes"]).isdigit() and int(row["size_bytes"]) > 0, "Invalid source size")
        result[old] = dict(row)
        destinations.add(new)
    require(not set(result) & destinations, "Chained or cyclic media migration")
    return result


def media_url(value, mapping, revision):
    require(HEX40.fullmatch(revision) is not None, "Invalid source revision")
    parsed = urlsplit(value)
    prefix = f"/datasets/{REPOSITORY}/resolve/"
    require(parsed.scheme == "https" and parsed.netloc == "huggingface.co"
            and parsed.path.startswith(prefix) and not parsed.query and not parsed.fragment,
            "Unexpected source URL")
    source_revision, separator, encoded = parsed.path[len(prefix):].partition("/")
    require(separator and HEX40.fullmatch(source_revision), "Source URL is not revision-pinned")
    path = safe_path(unquote(encoded))
    path = mapping.get(path, {}).get("new_path", path)
    return f"{BASE_URL}/resolve/{revision}/{quote(path, safe='/')}"


def migrate_descriptor(image, mapping, revision):
    result = copy.deepcopy(image)
    old = safe_path(image["image_path"])
    row = mapping.get(old)
    if row:
        require(image.get("sha256") == row["sha256"] and int(image.get("size_bytes", -1)) == int(row["size_bytes"]),
                "Photograph relocation changes identity or size")
        result["image_path"] = row["new_path"]
    if "fullResolutionUrl" in result:
        expected = f"/{quote(old, safe='/')}"
        require(urlsplit(result["fullResolutionUrl"]).path.endswith(expected), "Photograph URL/path mismatch")
        result["fullResolutionUrl"] = media_url(result["fullResolutionUrl"], mapping, revision)
    if "hfPath" in result:
        require(re.fullmatch(r"hf://datasets/" + re.escape(REPOSITORY) + r"@[a-f0-9]{40}/" + re.escape(old), result["hfPath"]),
                "Photograph HF locator/path mismatch")
        result["hfPath"] = f"hf://datasets/{REPOSITORY}@{revision}/{result['image_path']}"
    return result


def migrate_downloads(downloads, mapping, revision):
    result = copy.deepcopy(downloads)
    for row in result["rows"]:
        if row.get("path") is None:
            continue
        path = safe_path(row["path"])
        entry = mapping.get(path)
        if entry:
            require(row["sha256"] == entry["sha256"] and int(row["size_bytes"]) == int(entry["size_bytes"]),
                    "Download relocation changes identity or size")
            row["path"] = entry["new_path"]
        row["media_revision"] = revision
    result["media_revision"] = revision
    return result


def adopt_authoritative_downloads(baseline, authoritative, mapping, revision):
    expected = migrate_downloads(baseline, mapping, revision)
    by_work = {row["work_id"]: row for row in authoritative["rows"]}
    require(len(by_work) == len(authoritative["rows"]) and
            set(by_work) == {row["work_id"] for row in expected["rows"]}, "Master selection population changed")
    allowed = {"media_revision", "download_url", "historical_download_url"}
    for row in expected["rows"]:
        current = by_work[row["work_id"]]
        for field in row:
            if field not in allowed:
                require(current.get(field) == row[field], f"Master selection changed: {field}")
    return copy.deepcopy(authoritative)


def git_bytes(root, revision, path):
    require(HEX40.fullmatch(revision) is not None, "A full immutable Git revision is required")
    safe_path(path)
    return subprocess.check_output(["git", "show", f"{revision}:{path}"], cwd=root)


def object_identity(data):
    match = re.fullmatch(rb"version https://git-lfs.github.com/spec/v1\noid sha256:([a-f0-9]{64})\nsize ([0-9]+)\n", data)
    return (match[1].decode(), int(match[2])) if match else (digest(data), len(data))


def verified_mapping(source, revision):
    raw = git_bytes(source, revision, "Media_Naming/renames.csv")
    integrity = json.loads(git_bytes(source, revision, "Media_Naming/integrity.json"))
    require(integrity.get("renames_csv_sha256", integrity.get("renames_sha256")) == digest(raw), "Rename map checksum mismatch")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
    index = mapping_index(rows)
    base = integrity["base_revision"]
    require(HEX40.fullmatch(base) and all(r["base_revision"] == base for r in rows), "Mixed migration bases")
    subprocess.run(["git", "merge-base", "--is-ancestor", base, revision], cwd=source, check=True)
    for row in rows:
        expected = row["sha256"], int(row["size_bytes"])
        require(object_identity(git_bytes(source, base, row["old_path"])) == expected, "Original object differs from map")
        require(object_identity(git_bytes(source, revision, row["new_path"])) == expected, "Relocated object differs from map")
    return index, {"repository": REPOSITORY, "revision": revision, "path": "Media_Naming/renames.csv",
                   "sha256": digest(raw), "bytes": len(raw), "base_revision": base, "renamed_objects": len(rows)}


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def migrate_preview_manifest(value, revision):
    result = copy.deepcopy(value)
    result["sourceRevision"] = revision
    return result


def migrate_cache_tokens(text, revision):
    require(HEX40.fullmatch(revision) is not None, "Invalid source revision")
    for filename in ("selected-fronts.js", "photograph-downloads.js", "physical-references.json",
                     "reference-link-evidence.json", "app.js", "drawing-archive.js", "real-time-recordings.js"):
        text = re.sub(re.escape(filename) + r"\?v=[A-Za-z0-9_-]+",
                      filename + "?v=media-names-" + revision, text)
    return text


def migrate(source, revision, browser, baseline):
    mapping, binding = verified_mapping(source, revision)
    outputs = {}
    current_paths = set(subprocess.check_output(["git", "ls-tree", "-r", "-z", "--name-only", revision], cwd=source).decode().split("\0"))
    checked_objects = {}

    def verify_object(path, sha256, size):
        safe_path(path)
        require(path in current_paths, "Current media reference is missing: " + path)
        if path not in checked_objects:
            checked_objects[path] = object_identity(git_bytes(source, revision, path))
        require(checked_objects[path] == (sha256, int(size)), "Current media reference changes object identity: " + path)

    def read(path):
        return json.loads(git_bytes(browser, baseline, path))

    def bind(path):
        raw = git_bytes(source, revision, path)
        oid = subprocess.check_output(["git", "rev-parse", f"{revision}:{path}"], cwd=source, text=True).strip()
        return dict(path=path, revision=revision, sha256=digest(raw), bytes=len(raw), gitBlobOid=oid)

    records = read("data/records.json")
    old_revision = records["sourceRevision"]
    source_records = {r["record_id"]: r for r in csv.DictReader(io.StringIO(git_bytes(source, revision, "metadata.csv").decode()))}
    require(set(source_records) == {r["recordId"] for r in records["records"]}, "Standard recording population changed")
    records["sourceRevision"] = revision
    for row in records["records"]:
        authoritative = source_records[row["recordId"]]
        require(authoritative["hub_xet_hash"] == row["integrityReference"], "Standard recording identity changed")
        expected = row["filename"]
        require(authoritative["file_name"].split("/")[-1] == expected, "Standard filename unexpectedly changed")
        require(authoritative["file_name"] in current_paths, "Current Standard media path is absent")
        for field in ("videoUrl", "sourceUrl"):
            row[field] = media_url(row[field], mapping, revision)
    outputs["data/records.json"] = json_bytes(records)

    refs = read("data/physical-references.json")
    require(refs["sourceRevision"] == old_revision, "Baseline physical-reference pin differs")
    refs["sourceRevision"] = revision
    refs["mediaNamingMigration"] = {**binding, "browser_base_revision": baseline,
                                     "previous_source_inputs": copy.deepcopy(refs["sourceInputs"])}
    for path in refs["sourceInputs"]:
        refs["sourceInputs"][path] = bind(path)
    refs["currentRecords"] = dict(path="data/records.json", sha256=digest(outputs["data/records.json"]),
                                    bytes=len(outputs["data/records.json"]))
    for entry in refs["records"].values():
        if entry.get("mainImage"):
            entry["mainImage"] = migrate_descriptor(entry["mainImage"], mapping, revision)
        entry["additionalReferences"] = [migrate_descriptor(image, mapping, revision) for image in entry.get("additionalReferences", [])]
        for image in [entry.get("mainImage"), *entry["additionalReferences"]]:
            if image:
                verify_object(image["image_path"], image["sha256"], image["size_bytes"])
    # This lookup is intentionally minified in the browser repository.
    outputs["data/physical-references.json"] = (json.dumps(refs, separators=(",", ":"), ensure_ascii=False) + "\n").encode()

    evidence = read("data/reference-link-evidence.json")
    evidence["sourceRevision"] = revision
    evidence["lookupSha256"] = digest(outputs["data/physical-references.json"])
    evidence["mediaNamingMigration"] = binding
    evidence["sourceInputs"] = {path: bind(path) for path in evidence["sourceInputs"]}
    outputs["data/reference-link-evidence.json"] = json_bytes(evidence)

    selected = read("data/selected-fronts.json")
    selected["media_naming_migration"] = binding
    selected["recording_links"] = {**selected["recording_links"], **bind("Work_Identity/work_record_links.csv")}
    outputs["data/selected-fronts.json"] = json_bytes(selected)

    index_path = "Physical_References/Selected_Front_Downloads/downloads.json"
    authoritative_downloads = json.loads(git_bytes(source, revision, index_path))
    downloads = adopt_authoritative_downloads(read("data/photograph-downloads.json"), authoritative_downloads, mapping, revision)
    downloads["media_naming_migration"] = binding
    downloads["source_index"] = {"repository": REPOSITORY, **bind(index_path)}
    for row in downloads["rows"]:
        if row.get("path") is not None:
            verify_object(row["path"], row["sha256"], row["size_bytes"])
            media_revision = row.get("media_revision", downloads["media_revision"])
            require(HEX40.fullmatch(media_revision) and
                    object_identity(git_bytes(source, media_revision, row["path"])) == (row["sha256"], int(row["size_bytes"])),
                    "Source-declared download path/revision changes object identity")
    outputs["data/photograph-downloads.json"] = json_bytes(downloads)

    for path in ("previews/manifest.json", "reference-previews/manifest.json",
                 "assets/record-anchors/manifest.json", "assets/visual-anchors/manifest.json"):
        value = read(path)
        require(value["sourceRevision"] == old_revision, "Baseline derivative pin differs")
        value = migrate_preview_manifest(value, revision)
        for image in value.get("images", {}).values():
            if image.get("sourceUrl"):
                image["sourceUrl"] = media_url(image["sourceUrl"], mapping, revision)
            if image.get("sourcePath", "").startswith(BASE_URL + "/resolve/"):
                image["sourcePath"] = media_url(image["sourcePath"], mapping, revision)
        outputs[path] = json_bytes(value)

    manifest = {"sourceRepository": REPOSITORY, "sourceRevision": revision, "inputs": {}}
    for path in ("Real_Time_Recordings/metadata.csv", "Real_Time_Recordings/SHA256SUMS",
                 "Real_Time_Recordings/README.md", "Real_Time_Recordings/SCHEMA.md"):
        raw = git_bytes(source, revision, path)
        manifest["inputs"][path] = {"sha256": digest(raw), "sizeBytes": len(raw)}
        if path.endswith(".csv") or path.endswith("SHA256SUMS"):
            outputs["data/real-time-source/" + path.rsplit("/", 1)[-1]] = raw
    outputs["data/real-time-source/manifest.json"] = json_bytes(manifest)

    for path, constants in {
        "assets/selected-fronts.js": {"SELECTED_FRONTS_SHA256": "data/selected-fronts.json", "LEGACY_REFERENCE_SHA256": "data/physical-references.json"},
        "assets/photograph-downloads.js": {"PHOTOGRAPH_DOWNLOADS_SHA256": "data/photograph-downloads.json"},
    }.items():
        text = (browser / path).read_text()
        for constant, output in constants.items():
            text, count = re.subn(r'(' + re.escape(constant) + r' = ")[a-f0-9]{64}(";)',
                                  lambda match: match[1] + digest(outputs[output]) + match[2], text)
            require(count == 1, "Expected exact projection hash gate")
        outputs[path] = text.encode()
    for path in ("assets/selected-fronts.js", "assets/photograph-downloads.js", "assets/app.js",
                 "assets/drawing-archive.js", "index.html", "drawings.html"):
        text = outputs[path].decode() if path in outputs else (browser / path).read_text()
        outputs[path] = migrate_cache_tokens(text, revision).encode()
    return outputs, binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--browser-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--browser-base", required=True)
    parser.add_argument("--output", type=Path, required=True, help="Candidate output directory; files are not published")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, binding = migrate(args.source_root.resolve(), args.source_revision, args.browser_root.resolve(), args.browser_base)
    for path, raw in outputs.items():
        target = args.output / path
        if args.check:
            require(target.read_bytes() == raw, "Stale candidate: " + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
    print(json.dumps({"status": "verified" if args.check else "prepared", "source": binding,
                      "candidate_files": len(outputs), "publication": "not_performed"}, indent=2))


if __name__ == "__main__":
    main()
