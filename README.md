# Time-Lapse Artifacts website

Public browsing interface for the Standard Time Lapses collection in
[`maxwellinked/time-lapse-artifacts`](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts).

The site is intentionally dependency-free. It uses a pinned 357-record index
snapshot and committed four-second motion previews derived deterministically
from the pinned Hugging Face source MP4s. Full playback remains user-initiated
and streams from Hugging Face; the preview clips are presentation derivatives,
not archive records or replacements for the source recordings.

Public URL: <https://maxwellinked.github.io/time-lapse-artifacts/>

## Validation

Run the dependency-free checks before publishing:

```console
node --test tests/data-loader.test.mjs
node tools/validate.mjs
```

The browser validates the bundled index before rendering it, retries transient
same-origin failures with a bounded timeout, and offers a visible retry action
if the index remains unavailable. Normal browser and GitHub Pages HTTP caching
remain authoritative; the site does not keep a second local copy of archive
metadata.

## Refreshing the index

`data/records.json` identifies the pinned Hugging Face revision used by the site.
Refresh it only from a reviewed dataset state, then verify record count, ordering,
filters, source links, and direct record hashes before publishing.

The extraction helper is retained in `tools/extract-records.mjs` for reproducible
updates from a rendered index snapshot.

## Refreshing previews

Run `node tools/generate-previews.mjs --concurrency 6` on a machine with FFmpeg
and network access, then run `REQUIRE_PREVIEWS=1 node tools/validate.mjs`.

Each silent H.264 preview samples up to four seconds beginning at 82% of the
documented source duration, at 12 frames per second and a 480-pixel long edge.
Two deterministic retry positions handle source files that cannot be read at
the primary position. The browser loads these clips only as they enter view and
keeps them paused when reduced motion is requested.
