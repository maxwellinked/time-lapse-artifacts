# Time-Lapse Artifacts website

Public browsing interface for the Standard Time Lapses collection in
[`maxwellinked/time-lapse-artifacts`](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts).

The site is intentionally dependency-free. It uses a revision-pinned index
snapshot and committed four-second motion previews derived deterministically
from the pinned Hugging Face source MP4s. Full playback remains user-initiated
and streams from Hugging Face; the preview clips are presentation derivatives,
not archive records or replacements for the source recordings.

The gallery keeps strict, consecutive `Rec01` through `RecNN` filename runs in
numbered order for viewing continuity. This presentation rule does not assert a
shared work, session, or completion state.

Public URL: <https://maxwellinked.github.io/time-lapse-artifacts/>

## Validation

Run the dependency-free checks before publishing:

```console
node --test tests/*.test.mjs
node tools/validate.mjs
```

The [photograph clarification list](photograph-clarifications.html), also linked
beside the recording filters, groups questions and coverage gaps by work and
links every listed recording by stable ID. Supported indirect references are
not treated as unverified matches merely because their status is proposed.
Refresh it from the bundled, reviewed snapshot with
`node tools/build-photograph-clarifications.mjs`; validation rejects a stale list.

The photograph lookup generator's `--check` also requires the Git objects for
the lookup's `githubRevision` and Hugging Face `sourceRevision`. Use full-history
checkouts, or fetch those exact commits before checking a shallow checkout.
Inputs must retain their committed bytes; clone with `-c core.autocrlf=false`
when local Git settings would convert line endings. A missing baseline object
does not mean that the recorded baseline is invalid or should be replaced.

The browser validates the bundled index before rendering it, retries transient
same-origin failures with a bounded timeout, and offers a visible retry action
if the index remains unavailable. Normal browser and GitHub Pages HTTP caching
remain authoritative; the site does not keep a second local copy of archive
metadata.

## Refreshing the index

`data/records.json` identifies the exact Hugging Face revision used by the site.
Refresh it only from a reviewed dataset state, passing the full commit SHA:

```console
node tools/sync-records.mjs --revision <40-character-hugging-face-commit>
```

The sync reads the canonical Standard rows directly from that revision's
`metadata.csv`, retains their row indexes and content identities, and pins every
playback URL to the same revision. Verify record count, ordering, filters, source
links, and direct record hashes before publishing.

The legacy `tools/extract-records.mjs` helper has been removed; retrieve it from
Git history only to reproduce historical rendered index snapshots. Use
`tools/sync-records.mjs` for all current index refreshes.

## Refreshing previews

Run `node tools/generate-previews.mjs --concurrency 6` on a machine with FFmpeg
and network access, then run `REQUIRE_PREVIEWS=1 node tools/validate.mjs`.

Each silent H.264 preview samples up to four seconds beginning at 82% of the
documented source duration, at 12 frames per second and a 480-pixel long edge.
Two deterministic retry positions handle source files that cannot be read at
the primary position. The browser loads these clips only as they enter view and
keeps them paused when reduced motion is requested. The manifest binds each
preview to its record ID and Hub content identity, so unchanged clips are reused
across source-revision refreshes while new or changed records are regenerated.

## Physical-reference display previews

The gallery shows only unambiguous primary drawing photographs with a direct
owner-confirmed identification and exact confirmed source bytes. The same rule
governs the photograph filter, recording dialogs, and full-resolution links.
Proposed/transitive links, inferred export variants, supplemental-only images,
and unresolved selections are withheld from primary display and the confirmed
filter. Qualified links remain accessible in Reference details with their source,
authority and selection limits. Supported indirect links require checked public
premises and a matching processing receipt; other proposals remain explicitly
unverified here. The source lookup retains its original evidence.

Documented EXIF orientation is honored exactly once. No rotation, mirroring,
front/back identification, or recording endpoint is inferred from dimensions,
filenames, or a shared work ID. A direct owner identification is accepted as
drawing evidence; the current metadata does not separately attest alignment
relative to the video frame. See [the shared reference policy](REFERENCE_POLICY.md)
for the GitHub rules and the template for a Hugging Face implementation.

Recording dialogs reuse the selected photograph directly when its long edge is
at most 1024 pixels and its file is at most 512 KiB. Larger photographs use a
committed display JPEG alongside the existing motion preview. The explicit
full-resolution link still points to the exact
revision-pinned photograph. Source roles, proposed relationships, and selection
ambiguities retain their existing meanings; the inline image is labeled as a
display-sized preview and is not fine-detail evidence.

The pinned photograph layer has no separate display-sized set for oversized
selected images; other photographs of a work are not interchangeable with its
selected main image. Dataset Viewer assets depend on successful row processing,
so the site does not depend on them.

After refreshing `data/physical-references.json`, generate one preview per unique
oversized selected source hash (no preview is selected for unresolved candidates):

```console
npm install --no-save --package-lock=false sharp@0.34.5
node tools/generate-reference-previews.mjs
node tools/validate.mjs
```

Sharp is a build-time dependency only. The generator verifies the downloaded source
SHA-256, applies EXIF orientation once, fits the entire frame within 1024 × 1024
without upscaling or cropping, converts to sRGB, and emits quality-82 JPEGs. It
performs no enhancement. `reference-previews/manifest.json` binds each source hash
and pinned URL to the preview hash, dimensions, bytes, and processing settings.
Unchanged, verified previews are reused; commit the generated files and manifest
with the lookup refresh. Existing validation checks coverage, bindings, size bounds,
and preview hashes offline, and rejects obsolete JPEGs. After a successful build,
the generator removes hash-named previews no longer in the selected set.
A failed preview keeps the original link available;
it never automatically downloads the full-resolution source as a fallback.
