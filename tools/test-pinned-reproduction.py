#!/usr/bin/env python3
"""Check the published migration from its retained creator-corrected baseline.

Run with HF_SOURCE_ROOT pointing to a Git repository containing the pinned HF
commits. Only Git text/pointer objects and committed local displays are read;
no source media are decoded or generated. A partial clone may fetch missing Git
objects. This does not reconstruct the original selection candidate or JPEGs.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE_REVISION = "12d5713326886bc18669f2a5c571c4fe7ac1fb73"
SOURCE_BASE = "253e2ad859ea93b183110f19b5bbd78fc0bd6289"
BROWSER_BASE = "bfe047340508ef4cbb9c685bca72a632b5b6fccb"
EXPECTED_OUTPUTS = {
    "data/records.json", "data/physical-references.json",
    "data/reference-link-evidence.json", "data/selected-fronts.json",
    "data/photograph-downloads.json", "previews/manifest.json",
    "reference-previews/manifest.json", "assets/record-anchors/manifest.json",
    "assets/visual-anchors/manifest.json", "data/real-time-source/metadata.csv",
    "data/real-time-source/SHA256SUMS", "data/real-time-source/manifest.json",
    "assets/selected-fronts.js", "assets/photograph-downloads.js",
    "assets/app.js", "assets/drawing-archive.js", "index.html", "drawings.html",
}

SPEC = importlib.util.spec_from_file_location("pinned_migration", ROOT / "tools/migrate-media-names.py")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def baseline_json(path):
    return json.loads(subprocess.check_output(["git", "show", f"{BROWSER_BASE}:{path}"], cwd=ROOT))


class PinnedReproductionTests(unittest.TestCase):
    def test_published_inputs_reproduce_every_current_migration_output(self):
        source = os.environ.get("HF_SOURCE_ROOT")
        self.assertTrue(source, "Set HF_SOURCE_ROOT to the Git checkout with the pinned HF commits")
        outputs, binding = MIGRATION.migrate(Path(source).resolve(), SOURCE_REVISION, ROOT, BROWSER_BASE)
        self.assertEqual(binding["base_revision"], SOURCE_BASE)
        self.assertEqual(binding["renamed_objects"], 557)
        self.assertEqual(set(outputs), EXPECTED_OUTPUTS)
        for path, expected in outputs.items():
            with self.subTest(path=path):
                self.assertEqual((ROOT / path).read_bytes(), expected, f"Stale pinned migration output: {path}")

    def test_retained_selections_displays_and_correction_evidence_are_unchanged(self):
        selected = json.loads((ROOT / "data/selected-fronts.json").read_bytes())
        previous = baseline_json("data/selected-fronts.json")
        self.assertEqual(selected["selections"], previous["selections"])
        self.assertEqual(len(selected["selections"]), 435)
        for selection in previous["selections"]:
            work = selection["work_id"]
            with self.subTest(work_id=work):
                raw = (ROOT / "selected-fronts" / f"{work}.jpg").read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), selection["display"]["output_display_sha256"])

        references = json.loads((ROOT / "data/physical-references.json").read_bytes())
        historical = baseline_json("data/physical-references.json")
        self.assertEqual(references["workIdentityCorrection"], historical["workIdentityCorrection"])
        self.assertEqual(references["historicalSourceInputs"], historical["historicalSourceInputs"])
        self.assertEqual(references["mediaNamingMigration"]["previous_source_inputs"], historical["sourceInputs"])
        correction = references["workIdentityCorrection"]
        self.assertEqual(correction["revision"], SOURCE_BASE)
        self.assertEqual(correction["superseded_work_id"], "tlaw-b03bbfba8babbf3d")
        self.assertEqual(correction["survivor_work_id"], "tlaw-858a03eb138fbf47")
        self.assertNotIn(correction["superseded_work_id"], {s["work_id"] for s in selected["selections"]})
        for record in ("tla-109ffe803a4ae0b0", "tla-933e757350798d34"):
            with self.subTest(record_id=record):
                self.assertEqual(references["records"][record]["workId"], correction["survivor_work_id"])


if __name__ == "__main__":
    unittest.main()
