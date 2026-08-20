# Time-Lapse Artifacts website

Public browsing interface for the Standard Time Lapses collection in
[`maxwellinked/time-lapse-artifacts`](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts).

The site is intentionally static and dependency-free. It uses a pinned 357-record
index snapshot, streams source MP4s directly from Hugging Face only when requested,
and derives lightweight late-stage video thumbnails lazily as cards enter view.

Public URL: <https://maxwellinked.github.io/time-lapse-artifacts/>

## Refreshing the index

`data/records.json` identifies the pinned Hugging Face revision used by the site.
Refresh it only from a reviewed dataset state, then verify record count, ordering,
filters, source links, and direct record hashes before publishing.

The extraction helper is retained in `tools/extract-records.mjs` for reproducible
updates from a rendered index snapshot.
