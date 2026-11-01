# Published Hugging Face source-filename enrichment

Exactly **168 blank original_filename cells** are now filled on the authoritative Hugging Face source. [Source publication](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/commit/b93f2c7b0bc9e7959db0856474e6090cd50661d8) and [native-table publication](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/commit/9bc8132b66e39d74a562eae12a00df98c7a8edfd) are verified.

- [Exact 168 fills](metadata-fills.csv).
- [Publication receipt and artifact hashes](publication.json).
- [Published correction and evidence](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/tree/9bc8132b66e39d74a562eae12a00df98c7a8edfd/Standard_Time_Lapses/Provenance/Corrections/2026-11-01-source-filenames).
- [Archived prepublication review bundle](metadata-enrichment-patch.zip?raw=true), SHA-256 `932b752b96cbae92bf18552afa33601ac0e0de2e07dad1284659811950271543`. It retains its historical preparation status and local native-preview pin; current publication status is recorded above.

The names are literal local-ingest basenames from frozen Timing v2 observations. They establish no camera-original status or recording clock. Every other canonical cell, row position, media identity and frozen historical receipt is preserved. Forty-five original filenames and all 37 unknown Standard finish times remain unknown.

The native outputs were rebuilt independently on two machines; all five hashes matched. Published downloads matched those hashes. Every cell of the 1,349-row, 36-column canonical table matches the published source under its declared types and null rules.

Canonical metadata and timing v1/v2/current checks, 60 timing tests, native decode-disabled loading, 211 browser tests and site validation passed. The broader source suite retains seven failures and one error from an existing README assertion and unmaterialized Work_Images LFS inputs; exact cases and logs are in the archived bundle.

All 1,349 exposed browser records still match the source. The browser's current schema omits original_filename, so its index and application are unchanged. The hosted Hugging Face Viewer currently returns HTTP 500, response not ready; direct source and native Parquet files are published and verified.

This review-only GitHub draft is closed because authoritative publication is complete. No browser-main merge is required for these source-only fields.
