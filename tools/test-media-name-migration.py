#!/usr/bin/env python3
"""Bounded source-name migration tests; no network or media decoding."""
import copy
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("media_name_migration", Path(__file__).with_name("migrate-media-names.py"))
MIGRATION = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MIGRATION
SPEC.loader.exec_module(MIGRATION)

OLD = "Physical_References/Photographs/images/tlaw-" + "a" * 16 + "/" + "b" * 24 + ".jpg"
NEW = OLD.rsplit("/", 1)[0] + "/2026-10-22.0430.Photograph.Proposed.01.jpg"
REV = "c" * 40
SHA = "b" * 64
ROW = dict(old_path=OLD, new_path=NEW, sha256=SHA, size_bytes="123", base_revision="d" * 40)


class NameMigrationTests(unittest.TestCase):
    def test_descriptor_keeps_relationships_and_identity_while_updating_both_pinned_locators(self):
        descriptor = dict(image_path=OLD, sha256=SHA, size_bytes="123", work_id="tlaw-" + "a" * 16,
                          relationship_status="proposed", authority_class="derived_from_owner_confirmed_edges",
                          fullResolutionUrl=f"https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/{'e' * 40}/{OLD}",
                          hfPath=f"hf://datasets/maxwellinked/time-lapse-artifacts@{'e' * 40}/{OLD}")
        original = copy.deepcopy(descriptor)
        result = MIGRATION.migrate_descriptor(descriptor, {OLD: ROW}, REV)
        self.assertEqual(descriptor, original)
        self.assertEqual(result["image_path"], NEW)
        self.assertEqual(result["fullResolutionUrl"], f"https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/{REV}/{NEW}")
        self.assertEqual(result["hfPath"], f"hf://datasets/maxwellinked/time-lapse-artifacts@{REV}/{NEW}")
        for key in ("sha256", "size_bytes", "work_id", "relationship_status", "authority_class"):
            self.assertEqual(result[key], original[key])

    def test_descriptor_rejects_an_alias_for_different_bytes_or_size(self):
        for change in ({"sha256": "f" * 64}, {"size_bytes": "124"}):
            descriptor = {"image_path": OLD, "sha256": SHA, "size_bytes": "123", **change}
            with self.assertRaises(ValueError):
                MIGRATION.migrate_descriptor(descriptor, {OLD: ROW}, REV)

    def test_duplicate_destinations_and_path_escapes_are_rejected(self):
        for row in ({**ROW, "new_path": "../private.jpg"},
                    {**ROW, "old_path": "/absolute.jpg"},
                    {**ROW, "new_path": NEW.replace("/2026-", "/../2026-")}):
            with self.assertRaises(ValueError):
                MIGRATION.mapping_index([row])
        second = {**ROW, "old_path": OLD.replace("b" * 24, "f" * 24)}
        with self.assertRaises(ValueError):
            MIGRATION.mapping_index([ROW, second])

    def test_downloads_advance_path_and_media_pin_together_and_preserve_original_name(self):
        downloads = {"media_revision": "e" * 40, "source_photo_revision": "a" * 40,
                     "rows": [{"path": OLD, "sha256": SHA, "size_bytes": 123,
                               "source_filename": "camera-original.jpg", "work_id": "tlaw-" + "a" * 16,
                               "resolution_class": "limited_resolution_jpeg", "media_revision": "f" * 40}]}
        result = MIGRATION.migrate_downloads(downloads, {OLD: ROW}, REV)
        self.assertEqual(result["rows"][0]["path"], NEW)
        self.assertEqual(result["rows"][0]["media_revision"], REV)
        self.assertEqual(result["rows"][0]["source_filename"], "camera-original.jpg")
        self.assertEqual(result["source_photo_revision"], "a" * 40)
        self.assertEqual(downloads["rows"][0]["path"], OLD)

    def test_authoritative_downloads_keep_source_declared_pins_and_new_provenance_fields(self):
        baseline = {"media_revision": "e" * 40, "rows": [dict(path=OLD, sha256=SHA, size_bytes=123,
                    work_id="tlaw-" + "a" * 16, source_sha256=SHA, display_sha256="f" * 64)]}
        source = MIGRATION.migrate_downloads(baseline, {OLD: ROW}, "a" * 40)
        source["rows"][0]["historical_download_url"] = "retained-original-locator"
        result = MIGRATION.adopt_authoritative_downloads(baseline, source, {OLD: ROW}, REV)
        self.assertEqual(result, source)
        self.assertEqual(result["rows"][0]["media_revision"], "a" * 40)
        self.assertEqual(result["rows"][0]["historical_download_url"], "retained-original-locator")
        wrong = copy.deepcopy(source)
        wrong["rows"][0]["source_sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Master selection changed"):
            MIGRATION.adopt_authoritative_downloads(baseline, wrong, {OLD: ROW}, REV)

    def test_url_rebinding_requires_expected_repository_and_safe_path(self):
        valid = f"https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/{'a' * 40}/{OLD}"
        self.assertEqual(MIGRATION.media_url(valid, {OLD: ROW}, REV),
                         f"https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/{REV}/{NEW}")
        for invalid in (valid.replace("huggingface.co", "untrusted.example"),
                        valid.replace("/Photographs/", "/../Photographs/"), valid + "?download=true"):
            with self.assertRaises(ValueError):
                MIGRATION.media_url(invalid, {OLD: ROW}, REV)

    def test_committed_lfs_identity_is_checked_at_both_old_and_new_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args):
                return subprocess.check_output(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", *args], cwd=root, stderr=subprocess.DEVNULL)

            git("init", "-q")
            (root / OLD).parent.mkdir(parents=True)
            pointer = f"version https://git-lfs.github.com/spec/v1\noid sha256:{SHA}\nsize 123\n"
            (root / OLD).write_text(pointer)
            git("add", ".")
            git("commit", "-qm", "baseline")
            base = git("rev-parse", "HEAD").decode().strip()
            (root / OLD).rename(root / NEW)
            row = {**ROW, "base_revision": base}
            stream = io.StringIO(newline="")
            writer = csv.DictWriter(stream, fieldnames=list(row))
            writer.writeheader(); writer.writerow(row)
            raw = stream.getvalue().encode()
            (root / "Media_Naming").mkdir()
            (root / "Media_Naming/renames.csv").write_bytes(raw)
            (root / "Media_Naming/integrity.json").write_text(json.dumps({"base_revision": base, "renames_sha256": hashlib.sha256(raw).hexdigest()}))
            git("add", "-A"); git("commit", "-qm", "rename")
            revision = git("rev-parse", "HEAD").decode().strip()
            index, binding = MIGRATION.verified_mapping(root, revision)
            self.assertEqual(index[OLD]["new_path"], NEW)
            self.assertEqual(binding["renamed_objects"], 1)
            (root / NEW).write_text(pointer.replace(SHA, "f" * 64))
            git("add", "-A"); git("commit", "-qm", "wrong bytes")
            with self.assertRaisesRegex(ValueError, "Relocated object differs"):
                MIGRATION.verified_mapping(root, git("rev-parse", "HEAD").decode().strip())

    def test_preview_manifest_retains_the_strict_existing_schema(self):
        original = json.loads((Path(__file__).parents[1] / "previews/manifest.json").read_text())
        expected = copy.deepcopy(original)
        expected["sourceRevision"] = REV
        result = MIGRATION.migrate_preview_manifest(original, REV)
        self.assertEqual(result, expected)
        self.assertEqual(list(result), list(original))
        self.assertNotIn("mediaNamingMigration", result)

    def test_changed_runtime_modules_and_lookup_urls_receive_new_cache_keys(self):
        before = ('import x from "./selected-fronts.js?v=old"; '
                  'import y from "./photograph-downloads.js?v=old"; '
                  'fetch("data/physical-references.json?v=old"); '
                  'fetch("data/reference-link-evidence.json?v=old"); '
                  '<script src="assets/drawing-archive.js?v=old"></script>')
        result = MIGRATION.migrate_cache_tokens(before, REV)
        self.assertNotIn("?v=old", result)
        self.assertEqual(result.count("?v=media-names-" + REV), 5)


if __name__ == "__main__":
    unittest.main()
