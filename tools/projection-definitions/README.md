# Confirmed mixed reference append

This directory contains a reviewed scope definition, not a source-publication
receipt. The November 13 definition uses the published browser baseline
`783c99304eebb5dbbfc806a68d7c7554df7361d2` and source baseline
`5d9defcf8bfeb24a60dda29a17b7072c6823ad6b`. It binds the exact prepared source
confirmation, ingest plan and photo-source snapshot by SHA-256. There is no
placeholder future source commit.

The source must finish original-file transfer, technical checks, staged-index
publication, real revision binding, source validation and generated-table
regeneration before this adapter can produce a current browser projection.
Retain the published media/index-stage commits in the final source ancestry
through fast-forward or a reviewed merge. Copying files onto an unrelated
commit fails the ancestry gate.

After fetching the actual accepted source commit into a Git checkout, run from
a reviewed GitHub checkout containing the published browser baseline:

```sh
python3 -B tools/refresh-confirmed-work-projection.py \
  --source-root /path/to/hf-git \
  --source-revision "$accepted_source_revision" \
  --browser-root . --generated-at YYYY-MM-DD --output . \
  --append-definition tools/projection-definitions/2026-11-13-reference-drawings.json
```

`accepted_source_revision` must contain the actual verified 40-character final
HF commit. A prepared/pending source is rejected. The tool returns derived
bytes only; it never uploads, commits or publishes them. Rerun with `--check`
after generation. The receipt records 38 new Standard rows, 36 RT rows and
74 confirmed links distinctly. Positions are independent within each mode;
no pairing, coverage, clock calibration or orientation is inferred.

All 64 photograph containers remain source-only, with null canonical work
assignments and unchanged qualified associations. The current source-photo
manifest and immutable object observations are bound in the new receipt.
This does not add a photograph gallery or a selected-front choice.

Then generate the missing 38 bounded TL previews and their decorative
anchors through the existing tools. Their identity-aware caches retain the
old media bytes:

```sh
node tools/generate-previews.mjs --concurrency 2
node tools/generate-record-anchors.mjs
node tools/build-native-companions.mjs --check
node --test tests/*.test.mjs
python3 -B tools/test-mixed-reference-projection.py
HF_SOURCE_ROOT=/path/to/hf-git python3 -B tools/test-pinned-reproduction.py
HF_SOURCE_ROOT=/path/to/hf-git python3 -B tools/test-photo-selection-reproduction.py
REQUIRE_PREVIEWS=1 node tools/validate.mjs
```

The existing real-time source renderer supports the new confirmed work IDs;
its reviewed orientation overlay stays limited to the original 18 entries.
New RT files remain accessible as originals until separately reviewed.
The original standalone reference-lookup rebuild retains its historical
TL/Pre-Standard input contract. Use this bounded retained-lookup refresh for
the mixed append; it separately validates all RT links and projects only TL
entries into the recording/photo lookup.

Historical migration/additive receipts, photograph media revisions,
orientation evidence and drawing-process case-study pins are not rewritten.
Final publication and its live verification remain separate release steps.
