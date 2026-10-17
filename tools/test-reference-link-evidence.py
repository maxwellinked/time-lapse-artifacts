#!/usr/bin/env python3
"""Negative tests for the actual premise checker, without network access."""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("evidence", Path(__file__).with_name("build-reference-link-evidence.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def csv_bytes(rows):
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue().encode()


class PremiseTests(unittest.TestCase):
    def setUp(self):
        self.wid, self.rid, self.ref = "tlaw-" + "1" * 16, "tla-" + "2" * 16, "tlar-" + "3" * 16
        self.photo = dict(zip(module.FIELDS, module.DERIVED), sha256="4" * 64, work_id=self.wid,
                          evidence_reference_id=self.ref, image_path="photo.jpg", source_binding_method="exact_historical_reference_bytes",
                          processing_method="jpeg_metadata_only_codestream_unchanged")
        self.rows = [
            [{"work_id": self.wid, "status": "active"}],
            [{"record_id": self.rid, "work_id": self.wid, "owner_confirmation_state": "owner_confirmed", "source_hub_revision": "a" * 40}],
            [{"work_id": self.wid, "relationship_status": "proposed", "uncertainty_code": ""}],
            [{"reference_id": self.ref, "record_id": self.rid, "owner_confirmation_state": "owner_confirmed_record_link",
              "relationship_type": "owner_confirmed_record_reference", "source_hub_revision": "b" * 40,
              "owner_evidence": "Recorded owner identification.",
              "reference_image_sha256": "5" * 64, "surface_scope": "front_surface", "caution": "No endpoint claim."}],
        ]

    def build(self, receipt_change=None):
        inputs = dict(zip(module.SOURCES[:4], map(csv_bytes, self.rows)))
        receipt = {**self.photo, **(receipt_change or {})}
        inputs[module.SOURCES[4]] = json.dumps({"successor_addition": {"records": [receipt]}}).encode()
        lookup = {"sourceRevision": "c" * 40, "sourceInputs": {p: {"sha256": module.digest(inputs[p])} for p in module.SOURCES[:2]},
                  "records": {self.rid: {"mainImage": self.photo, "additionalReferences": []}}}
        return module.build(json.dumps(lookup).encode(), inputs)["images"]

    def test_requires_actual_premises_and_retains_qualifications(self):
        proof = self.build()[self.photo["sha256"]]
        self.assertEqual(proof["bridgeRecordId"], self.rid)
        self.assertEqual(proof["caution"], "No endpoint claim.")
        self.assertEqual(self.photo["relationship_status"], "proposed")

    def test_transitive_label_cannot_replace_a_reference_id(self):
        self.photo["evidence_reference_id"] = ""
        self.assertFalse(self.build())

    def test_rejects_wrong_work_or_unconfirmed_record_membership(self):
        for field, value in [("work_id", "tlaw-" + "f" * 16), ("owner_confirmation_state", "proposed")]:
            with self.subTest(field=field):
                before = copy.deepcopy(self.rows)
                self.rows[1][0][field] = value
                self.assertFalse(self.build())
                self.rows = before

    def test_rejects_unconfirmed_photo_or_missing_source_identity(self):
        for field, value in [("owner_confirmation_state", "proposed"), ("reference_image_sha256", ""),
                             ("record_id", "tla-" + "f" * 16), ("source_hub_revision", "main"), ("owner_evidence", "")]:
            with self.subTest(field=field):
                before = copy.deepcopy(self.rows)
                self.rows[3][0][field] = value
                self.assertFalse(self.build())
                self.rows = before

    def test_published_file_requires_its_own_matching_processing_receipt(self):
        for change in [{"sha256": "f" * 64}, {"image_path": "another-photo.jpg"},
                       {"work_id": "tlaw-" + "f" * 16}, {"source_binding_method": "inferred_same_capture_export_variant"}]:
            with self.subTest(change=change):
                self.assertFalse(self.build(change))

    def test_rejects_unresolved_work_evidence_and_duplicate_membership(self):
        self.rows[2][0]["uncertainty_code"] = "ambiguous"
        self.assertFalse(self.build())
        self.rows[2][0]["uncertainty_code"] = ""
        self.rows[1].append(copy.deepcopy(self.rows[1][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.build()


if __name__ == "__main__":
    unittest.main()
