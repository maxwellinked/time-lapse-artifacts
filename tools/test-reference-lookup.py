#!/usr/bin/env python3
"""Source/identity tests for the optional photograph lookup; no media fixtures."""
import copy
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("reference_lookup", Path(__file__).with_name("build-reference-lookup.py"))
lookup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lookup)
REV = "1" * 40
GHREV = "2" * 40
WIDS = ["tlaw-" + f"{i:016x}" for i in range(1, 5)]
RIDS = ["tla-" + f"{i:016x}" for i in range(1, 6)]


def csv_bytes(header, rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=header, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode()


def photo(work, number, purpose="primary_inspection", resolution="native_full_resolution_inspection"):
    digest = f"{number:024x}" + "0" * 40
    return dict(image_path=f"Physical_References/Photographs/images/{work}/{digest[:24]}.jpg", sha256=digest,
                work_id=work, image_role="drawing_reference", view_purpose=purpose, width_px="10", height_px="20",
                encoded_width_px="10", encoded_height_px="20", orientation="1", size_bytes="100",
                relationship_status="owner_confirmed", evidence_class="direct_owner_confirmed", authority_class="owner_direct",
                derivation_method="direct_confirmation", evidence_reference_id="",
                processing_spec="Physical_References/Photographs/PROCESSING.json", processing_method="jpeg_metadata_only_codestream_unchanged",
                source_binding_method="exact_confirmed_source_bytes", inspection_resolution_class=resolution)


def fixture(revision=REV):
    header = ["file_name", "record_id", "work_id", "collection_tier", "hub_xet_hash"]
    standard = [dict(file_name=f"Standard_Time_Lapses/{i}.mp4", record_id=RIDS[i], work_id=WIDS[i],
                     collection_tier="standard", hub_xet_hash=f"{i+11:064x}") for i in range(4)]
    pre = [dict(file_name="pre.mp4", record_id=RIDS[4], work_id="", collection_tier="pre_standard", hub_xet_hash="a" * 64)]
    works = [dict(work_id=wid, status="active", superseded_by_work_id="") for wid in WIDS]
    links = [dict(work_id=WIDS[i], record_id=RIDS[i], owner_confirmation_state="owner_confirmed", source_hub_revision=REV) for i in range(4)]
    photos = [photo(WIDS[0], 1), photo(WIDS[0], 2, "supplemental_documentation", "supplemental_documentation"),
              photo(WIDS[1], 3, resolution="limited_resolution_full_drawing_reference"),
              photo(WIDS[2], 4, "supplemental_documentation", "supplemental_documentation")]
    photos[1]["source_binding_method"] = "inferred_same_capture_export_variant"
    inputs = dict(zip(lookup.SOURCES, [csv_bytes(header, standard), csv_bytes(header, pre),
        csv_bytes(["work_id", "status", "superseded_by_work_id"], works),
        csv_bytes(["work_id", "record_id", "owner_confirmation_state", "source_hub_revision"], links),
        csv_bytes(lookup.PHOTO_FIELDS, photos)]))
    github = dict(sourceRepository=lookup.REPOSITORY, sourceRevision=revision, collection="Standard_Time_Lapses", records=[])
    for i in reversed(range(4)):
        source = standard[i]
        _, url = lookup.urls(source["file_name"], revision)
        github["records"].append(dict(recordId=source["record_id"], rowIndex=i, filename=f"{i}.mp4", videoUrl=url,
                                      sourceUrl=url, integrityReference=source["hub_xet_hash"]))
    return inputs, github, photos


class ReferenceLookupContract(unittest.TestCase):
    def setUp(self):
        self.inputs, self.github, self.photos = fixture()

    def build(self):
        return lookup.build_lookup(self.inputs, REV, json.dumps(self.github).encode(), GHREV)

    def test_exact_standard_membership_four_cases_and_pre_exclusion(self):
        before = copy.deepcopy(self.github)
        result = self.build()
        self.assertEqual(set(result["records"]), set(RIDS[:4]))
        self.assertNotIn(RIDS[4], result["records"])
        self.assertEqual(result["counts"]["pairedRecords"], 3)
        self.assertEqual(result["counts"]["nullRecords"], 1)
        self.assertEqual([result["records"][rid]["referenceRole"] for rid in RIDS[:4]],
                         ["native full drawing", "limited", "supplemental-only", "missing"])
        self.assertEqual(self.github, before)
        self.assertEqual(result["records"][RIDS[3]]["clarification"], "")
        self.assertIsNone(result["records"][RIDS[3]]["mainImage"])

    def test_full_manifest_and_variant_evidence_retained_with_pinned_links(self):
        record = self.build()["records"][RIDS[0]]
        image = record["mainImage"]
        self.assertEqual({name: image[name] for name in lookup.PHOTO_FIELDS}, self.photos[0])
        self.assertIn("/resolve/" + REV + "/", image["fullResolutionUrl"])
        self.assertTrue(image["hfPath"].startswith("hf://datasets/" + lookup.REPOSITORY + "@" + REV + "/"))
        self.assertEqual(record["clarification"], lookup.CLARIFICATION)
        self.assertEqual(record["additionalReferences"][0]["source_binding_method"], "inferred_same_capture_export_variant")
        self.assertEqual(record["additionalReferences"][0]["view_purpose"], "supplemental_documentation")

    def test_public_display_derivative_retains_limited_representation_and_rejects_false_fidelity(self):
        display = self.photos[0]
        display.update(source_binding_method="owner_confirmed_display_derivative",
                       processing_method="public_display_JPEG_bytes_unchanged", evidence_reference_id="M002",
                       inspection_resolution_class="limited_resolution_full_drawing_reference")
        self.inputs[lookup.PHOTO_MANIFEST] = csv_bytes(lookup.PHOTO_FIELDS, self.photos)
        result = self.build()["records"][RIDS[0]]
        self.assertEqual(result["mainImage"]["source_binding_method"], "owner_confirmed_display_derivative")
        self.assertIn("display JPEG derivative", result["referenceRole"])
        for field, value in [("inspection_resolution_class", "native_full_resolution_inspection"),
                             ("source_binding_method", "exact_confirmed_source_bytes"),
                             ("processing_method", "jpeg_metadata_only_codestream_unchanged"),
                             ("evidence_reference_id", ""), ("width_px", "1025"),
                             ("size_bytes", "524289"), ("orientation", "3")]:
            changed = copy.deepcopy(self.photos)
            changed[0][field] = value
            self.inputs[lookup.PHOTO_MANIFEST] = csv_bytes(lookup.PHOTO_FIELDS, changed)
            with self.subTest(field=field), self.assertRaises(lookup.ContractError):
                self.build()

    def test_wrong_github_pin_unknown_or_duplicate_id_rejected(self):
        variants = []
        wrong = copy.deepcopy(self.github); wrong["sourceRevision"] = "3" * 40; variants.append(wrong)
        wrong = copy.deepcopy(self.github); wrong["records"][0]["recordId"] = RIDS[4]; variants.append(wrong)
        wrong = copy.deepcopy(self.github); wrong["records"][0] = copy.deepcopy(wrong["records"][1]); variants.append(wrong)
        for wrong in variants:
            with self.subTest(wrong=wrong), self.assertRaises(lookup.ContractError):
                lookup.build_lookup(self.inputs, REV, json.dumps(wrong).encode(), GHREV)

    def test_record_row_path_and_integrity_conflicts_rejected(self):
        for field, value in [("rowIndex", 0), ("rowIndex", True), ("filename", "wrong.mp4"),
                             ("videoUrl", "https://example.invalid/wrong.mp4"), ("integrityReference", "f" * 64)]:
            with self.subTest(field=field, value=value):
                wrong = copy.deepcopy(self.github); wrong["records"][0][field] = value
                with self.assertRaises(lookup.ContractError):
                    lookup.build_lookup(self.inputs, REV, json.dumps(wrong).encode(), GHREV)

    def test_ambiguous_source_choice_is_null_with_all_evidence_retained(self):
        photos = self.photos + [photo(WIDS[0], 9)]
        self.inputs[lookup.PHOTO_MANIFEST] = csv_bytes(lookup.PHOTO_FIELDS, photos)
        record = self.build()["records"][RIDS[0]]
        self.assertEqual(record["selectionStatus"], "selection_unresolved")
        self.assertEqual(record["referenceRole"], "selection unresolved")
        self.assertIsNone(record["mainImage"])
        self.assertEqual(record["clarification"], "")
        self.assertEqual(len(record["additionalReferences"]), 3)

    def test_conflicting_source_link_cannot_be_replaced_by_metadata_guess(self):
        _, links = lookup.table(self.inputs[lookup.SOURCES[3]], "links")
        links[0]["work_id"] = WIDS[1]
        self.inputs[lookup.SOURCES[3]] = csv_bytes(list(links[0]), links)
        with self.assertRaises(lookup.ContractError):
            self.build()

    def derived(self, photo, binding="exact_historical_reference_bytes"):
        photo.update(relationship_status="proposed", evidence_class="deterministic_transitive_bridge",
                     authority_class="derived_from_owner_confirmed_edges", derivation_method="transitive_closure",
                     source_binding_method=binding)

    def repack_photos(self):
        self.inputs[lookup.PHOTO_MANIFEST] = csv_bytes(lookup.PHOTO_FIELDS, self.photos)

    def rename_photo(self, index=0, context="2026-01-08.1610", status="OwnerConfirmed"):
        image = self.photos[index]
        image["sha256"] = f"{index + 1:012x}" + "abcdef0123456" * 4
        image["image_path"] = (f"Physical_References/Photographs/images/{image['work_id']}/"
                               f"{context}.PhotographReference.{status}.{image['work_id']}."
                               f"Seq0012.{image['sha256'][:12]}.jpg")
        self.repack_photos()
        return image

    def test_renamed_photos_keep_exact_manifest_evidence_and_pinned_links(self):
        for context, status in [("2026-01-08.1610", "Proposed"),
                                ("2026-07-02.UnknownTime", "OwnerConfirmed"),
                                ("UnknownDate.UnknownTime", "OwnerConfirmed"),
                                ("2026-07-19_to_2026-07-20.MultipleTimes", "Proposed"),
                                ("2026-07-19.MultipleTimes", "OwnerConfirmed")]:
            with self.subTest(context=context, status=status):
                self.inputs, self.github, self.photos = fixture()
                if status == "Proposed":
                    self.derived(self.photos[0])
                photo = self.rename_photo(context=context, status=status)
                record = self.build()["records"][RIDS[0]]
                image = record["mainImage"]
                self.assertEqual({key: image[key] for key in lookup.PHOTO_FIELDS}, photo)
                self.assertEqual(image["fullResolutionUrl"],
                                 f"https://huggingface.co/datasets/{lookup.REPOSITORY}/resolve/{REV}/{photo['image_path']}")
                self.assertEqual(image["hfPath"], f"hf://datasets/{lookup.REPOSITORY}@{REV}/{photo['image_path']}")
                self.assertEqual(record["clarification"], lookup.CLARIFICATION)
                self.assertEqual("(proposed relationship)" in record["referenceRole"], status == "Proposed")

    def test_published_renamed_photograph_examples_are_accepted(self):
        # Exact examples from HF 12d5713326886bc18669f2a5c571c4fe7ac1fb73.
        examples = [
            ("tlaw-006d0454b98f434d", "2026-01-08.1610.PhotographReference.Proposed.tlaw-006d0454b98f434d.Seq0012.16a8cd1ec396.jpg",
             '16a8cd1ec39682aa4750267af77b16f8707663af4d2c6d435d44cc8b5c78cc45', "proposed"),
            ("tlaw-0308e9ad083f859a", "2026-09-30.1643.PhotographReference.OwnerConfirmed.tlaw-0308e9ad083f859a.Seq0015.7a2051a946c4.jpg",
             "7a2051a946c424fe030effd7904e71beb5c21c1a5307540a5c0f30ce9a783733", "owner_confirmed"),
            ("tlaw-3af9586b916a371e", "2026-07-22_to_2026-07-23.MultipleTimes.PhotographReference.OwnerConfirmed.tlaw-3af9586b916a371e.Seq0109.a40da8332e63.jpg",
             "a40da8332e63470a018234a3db24be347be274b44512ac9b38db7babacfbae24", "owner_confirmed"),
        ]
        for wid, name, sha, status in examples:
            with self.subTest(name=name):
                lookup.validate_photo_path(dict(image_path=f"Physical_References/Photographs/images/{wid}/{name}",
                                                work_id=wid, sha256=sha, relationship_status=status))

    def test_renamed_photograph_rejects_hash_work_status_and_shape_mismatches(self):
        image = self.rename_photo()
        valid = copy.deepcopy(self.photos)
        path, sha = image["image_path"], image["sha256"]
        variants = [
            ("sha256", "f" + sha[1:]), ("sha256", sha[:12]), ("sha256", sha.upper()),
            ("image_path", path.replace(sha[:12] + ".jpg", "f" * 12 + ".jpg")),
            ("image_path", path.replace(sha[:12] + ".jpg", sha[:11] + ".jpg")),
            ("image_path", path.replace(sha[:12] + ".jpg", sha[:13] + ".jpg")),
            ("image_path", path.replace("/" + WIDS[0] + "/", "/" + WIDS[1] + "/")),
            ("image_path", path.replace("." + WIDS[0] + ".", "." + WIDS[1] + ".")),
            ("image_path", path.replace(".OwnerConfirmed.", ".Proposed.")),
            ("image_path", path.replace(".OwnerConfirmed.", ".")),
            ("image_path", path.replace("PhotographReference", "PhotographSelectedFront")),
            ("image_path", path.replace("Seq0012", "Seq12")),
            ("image_path", path.replace("Seq0012", "Seq0000")),
            ("image_path", path.replace("2026-01-08", "2026-01")),
            ("image_path", path.replace(".jpg", ".JPG")),
            ("image_path", path + ".extra"), ("image_path", path + "\n"),
            ("image_path", path.replace("/images/", "/other/")),
            ("work_id", WIDS[1]),
        ]
        for field, value in variants:
            with self.subTest(field=field, value=value):
                self.photos = copy.deepcopy(valid)
                self.photos[0][field] = value
                self.repack_photos()
                with self.assertRaisesRegex(lookup.ContractError, "photograph|Photograph"):
                    self.build()

    def test_renamed_photograph_rejects_unsafe_paths(self):
        path = self.rename_photo()["image_path"]
        for value in ("/" + path, "../" + path, path.replace("/images/", "/images/../images/"),
                      path.replace("/images/", "/images//"), path.replace("/images/", "/images/./"),
                      path.replace("/images/", "/images/%2e%2e/"), path.replace("/", "\\"),
                      path + "?download=true", path + "#fragment", path + "\0"):
            with self.subTest(path=value):
                self.photos[0]["image_path"] = value
                self.repack_photos()
                with self.assertRaisesRegex(lookup.ContractError, "unsafe/noncanonical path"):
                    self.build()

    def test_renamed_photograph_duplicates_still_fail_closed(self):
        self.rename_photo()
        valid = copy.deepcopy(self.photos)
        for same_path, same_bytes in ((True, True), (False, True), (True, False)):
            with self.subTest(same_path=same_path, same_bytes=same_bytes):
                duplicate = copy.deepcopy(valid[0])
                if not same_path:
                    duplicate["image_path"] = duplicate["image_path"].replace("Seq0012", "Seq0013")
                if not same_bytes:
                    # Same filename prefix, distinct full hashes: reject by path.
                    duplicate["sha256"] = duplicate["sha256"][:-1] + "0"
                self.photos = valid + [duplicate]
                self.repack_photos()
                with self.assertRaisesRegex(lookup.ContractError, "Duplicate photograph path/bytes"):
                    self.build()

    def test_legacy_photograph_hash_binding_still_fails_closed(self):
        for sha in ("f" * 64, self.photos[0]["sha256"][:24], "A" * 64):
            with self.subTest(sha=sha):
                self.photos[0]["sha256"] = sha
                self.repack_photos()
                with self.assertRaisesRegex(lookup.ContractError, "Invalid photograph path/SHA binding"):
                    self.build()

    def test_renamed_photograph_cannot_bypass_active_work_check(self):
        self.rename_photo()
        _, works = lookup.table(self.inputs[lookup.SOURCES[2]], "works")
        works[0].update(status="superseded", superseded_by_work_id=WIDS[1])
        self.inputs[lookup.SOURCES[2]] = csv_bytes(list(works[0]), works)
        # No positive recording link remains on the retired work.
        for name in (lookup.SOURCES[0], lookup.SOURCES[3]):
            self.inputs[name] = self.inputs[name].replace(WIDS[0].encode(), WIDS[1].encode())
        with self.assertRaisesRegex(lookup.ContractError, "Photograph is not linked to an active registered work"):
            self.build()

    def test_derived_photo_keeps_all_manifest_fields_and_visible_proposed_qualification(self):
        self.derived(self.photos[0])
        self.repack_photos()
        result = self.build()
        record = result["records"][RIDS[0]]
        self.assertEqual({name: record["mainImage"][name] for name in lookup.PHOTO_FIELDS}, self.photos[0])
        self.assertEqual(record["referenceRole"], "native full drawing. Linked through recording and registered work (proposed relationship). Source representation: exact historically bound reference bytes.")
        self.assertEqual(record["clarification"], "Same registered work. The photograph does not establish this recording’s endpoint.")
        self.assertEqual(result["sourceRevision"], REV)
        self.assertEqual(set(result["records"]), set(RIDS[:4]))

    def test_review_derivative_is_limited_original_unavailable_without_field_promotion(self):
        self.derived(self.photos[2], "provenance_bound_review_derivative")
        self.repack_photos()
        record = self.build()["records"][RIDS[1]]
        self.assertEqual(record["mainImage"]["inspection_resolution_class"], "limited_resolution_full_drawing_reference")
        self.assertIn("provenance-bound review JPEG; original unavailable; limited representation.", record["referenceRole"])
        self.photos[2]["inspection_resolution_class"] = "native_full_resolution_inspection"
        self.repack_photos()
        with self.assertRaises(lookup.ContractError):
            self.build()

    def test_derived_binding_and_relationship_cross_products_fail_closed(self):
        for field, value in [("source_binding_method", "exact_confirmed_source_bytes"),
                             ("source_binding_method", "inferred_same_capture_export_variant"),
                             ("relationship_status", "owner_confirmed"), ("evidence_class", "visual_similarity"),
                             ("authority_class", "owner_direct"), ("derivation_method", "direct_confirmation")]:
            with self.subTest(field=field, value=value):
                self.inputs, self.github, self.photos = fixture()
                self.derived(self.photos[0])
                self.photos[0][field] = value
                self.repack_photos()
                with self.assertRaises(lookup.ContractError):
                    self.build()
        for binding in ("exact_historical_reference_bytes", "provenance_bound_review_derivative"):
            self.inputs, self.github, self.photos = fixture()
            self.photos[0]["source_binding_method"] = binding
            self.repack_photos()
            with self.assertRaises(lookup.ContractError):
                self.build()

    def test_proposed_and_direct_candidates_do_not_auto_select_a_primary(self):
        extra = photo(WIDS[0], 9)
        self.derived(extra)
        self.photos.append(extra)
        self.repack_photos()
        record = self.build()["records"][RIDS[0]]
        self.assertIsNone(record["mainImage"])
        self.assertEqual(record["selectionStatus"], "selection_unresolved")
        self.assertEqual(record["clarification"], "")
        self.assertEqual(record["additionalReferences"][-1]["source_binding_method"], "exact_historical_reference_bytes")

    def test_git_bound_cli_positive_mismatch_stale_check_and_no_source_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); hf = base / "hf"; gh = base / "gh"
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
            def git(root, *args):
                return subprocess.check_output(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                    "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-C", str(root), *args], env=env, stderr=subprocess.DEVNULL)
            for name, data in self.inputs.items():
                path = hf / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            git(hf, "init", "--quiet"); git(hf, "add", "--", *lookup.SOURCES); git(hf, "commit", "--quiet", "-m", "HF text fixture")
            hf_rev = git(hf, "rev-parse", "HEAD").decode().strip()
            _, github, _ = fixture(hf_rev)
            records = gh / "data/records.json"; records.parent.mkdir(parents=True); records.write_text(json.dumps(github), encoding="utf-8")
            git(gh, "init", "--quiet"); git(gh, "add", "data/records.json"); git(gh, "commit", "--quiet", "-m", "GH text fixture")
            gh_rev = git(gh, "rev-parse", "HEAD").decode().strip()
            output = base / "derived/physical-references.json"
            command = [sys.executable, "-B", str(Path(lookup.__file__)), "--source-root", str(hf), "--source-revision", hf_rev,
                       "--github-root", str(gh), "--github-revision", gh_rev, "--records", str(records), "--output", str(output)]
            self.assertEqual(subprocess.run(command, capture_output=True, env=env).returncode, 0)
            generated = output.read_bytes()
            self.assertEqual(subprocess.run(command + ["--check"], capture_output=True, env=env).returncode, 0)
            original = records.read_bytes(); records.write_bytes(original + b" ")
            failed = subprocess.run(command + ["--check"], capture_output=True, env=env)
            self.assertNotEqual(failed.returncode, 0); self.assertIn(b"Copied GitHub records bytes differ", failed.stderr)
            records.write_bytes(original)
            source = hf / "metadata.csv"; original_source = source.read_bytes(); source.write_bytes(original_source + b"\n")
            self.assertNotEqual(subprocess.run(command + ["--check"], capture_output=True, env=env).returncode, 0)
            source.write_bytes(original_source)
            output.write_bytes(generated + b"stale")
            self.assertNotEqual(subprocess.run(command + ["--check"], capture_output=True, env=env).returncode, 0)
            self.assertEqual(output.read_bytes(), generated + b"stale")
            self.assertEqual(self.inputs, {name: (hf / name).read_bytes() for name in lookup.SOURCES})
            self.assertEqual(records.read_bytes(), original)
            self.assertFalse(any(base.rglob("*.mp4"))); self.assertFalse(any(base.rglob("*.jpg")))


if __name__ == "__main__":
    unittest.main()
