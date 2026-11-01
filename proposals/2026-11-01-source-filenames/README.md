# Proposed Hugging Face metadata enrichment

Publication is blocked by Hugging Face HTTP 403 for both direct commit and PR creation. This draft holds review materials; authoritative source publication is still pending. The live dataset, browser data and website remain unchanged.

Exactly **168 blank original_filename cells** can be filled from literal source_filename values in the [frozen public Timing v2 observations](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/fcbe6277ca34c6a5dd4a15d82e4f0654b46ffbee/Standard_Time_Lapses/Provenance/Recording_Timing_v2/observations.json). These are retained local-ingest basenames. They establish no camera-original status or recording clock.

- [Review the 168 exact fills](metadata-fills.csv).
- [Download the complete patch bundle](metadata-enrichment-patch.zip?raw=true): source patch, eight source files, exact correction receipt, validator tests, generated native previews, publication helper and validation logs.
- Bundle SHA-256: `932b752b96cbae92bf18552afa33601ac0e0de2e07dad1284659811950271543`.

The immutable source baseline is `fcbe6277ca34c6a5dd4a15d82e4f0654b46ffbee`. Only the 168 formerly blank filename cells change. Every other canonical cell, row order, media identity and historical receipt is preserved. Forty-five earlier filenames and all 37 unknown Standard finish times remain unknown.

Validation passed for canonical metadata, timing v1/v2/current, 60 timing tests, native table cells/schema/nulls/order and decode-disabled loading. The browser's 211 tests and site validator passed; all 1,349 exposed records match candidate source values. The full source suite has seven failures and one error from an existing README assertion and unmaterialized Work_Images LFS files; exact names and logs are bundled.

Native previews use unpublished local candidate revision `d0510b7df4afee331d0b34ff5377d470e7b9cd1a`. The publication helper regenerates them at the actual published source commit and verifies uploaded hashes. It requires repository write access and stops if the authoritative source has advanced.
