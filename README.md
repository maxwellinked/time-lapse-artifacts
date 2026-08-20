# Time-Lapse Artifacts website

Public browsing interface for the Standard Time Lapses collection in
[`maxwellinked/time-lapse-artifacts`](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts).

The site is intentionally static and dependency-free. It uses a pinned 357-record
index snapshot, serves committed late-stage JPEG thumbnails, and streams source
MP4s directly from Hugging Face only when a recording is opened. If a JPEG is
unavailable, the browser falls back to deriving a preview from the source video.

Public URL: <https://maxwellinked.github.io/time-lapse-artifacts/>

## Refreshing the index

`data/records.json` identifies the pinned Hugging Face revision used by the site.
Refresh it only from a reviewed dataset state, then verify record count, ordering,
filters, source links, and direct record hashes before publishing.

The extraction helper is retained in `tools/extract-records.mjs` for reproducible
updates from a rendered index snapshot.

## Refreshing thumbnails

Run `node tools/generate-thumbnails.mjs --concurrency 10` on a machine with FFmpeg
and network access, then run `REQUIRE_THUMBNAILS=1 node tools/validate.mjs`.
