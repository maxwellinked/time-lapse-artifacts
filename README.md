# Time-Lapse Artifacts website

Public browsing interface for the Standard Time Lapses collection in
[`maxwellinked/time-lapse-artifacts`](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts).

The site is intentionally dependency-free. It uses a revision-pinned index
snapshot and committed four-second motion previews derived deterministically
from the pinned Hugging Face source MP4s. Full playback remains user-initiated
and streams from Hugging Face; the preview clips are presentation derivatives,
not archive records or replacements for the source recordings.

The archive documents recorded drawing processes and photographed drawing states. Their documented relationships support comparison while leaving intention, perceptual experience and unrecorded activity open to investigation.

The gallery keeps strict, consecutive `Rec01` through `RecNN` filename runs in
numbered order for viewing continuity. This presentation rule does not assert a
shared work, session, or completion state.

Public URL: <https://maxwellinked.github.io/time-lapse-artifacts/>

## Recording mode and real-time evidence

The [real-time recording list](real-time-recordings.html) exposes the separately
indexed MOV collection and all of its original metadata values in
[`data/real-time-recordings.json`](data/real-time-recordings.json). Each entry
retains its published candidate relationship, timing basis, source-role status,
demux result and notes. Standard recording dialogs link to their listed
real-time candidates. A candidate does not inherit the time-lapse record's work
identity, photograph or finish label.

`recordingMode` in the Standard browser index is `time_lapse`; `recording_mode`
in the real-time projection is `real_time`. These values describe the documented
collections. They are separate from file extension, encoded frame rate and the
existing `captureType` field, which is retained as the acquisition-protocol
version for compatibility. Dialogs label that value **Acquisition protocol**.
Durations are labeled as encoded video duration.

The real-time projection preserves every source CSV field as a string, including
blank values, and adds only its explicit recording mode. Its source revision
matches the Standard browser snapshot. The small retained CSV/checksum inputs
and their hashes support deterministic offline regeneration:

```console
node tools/build-real-time-recordings.mjs --check
node tools/build-real-time-recordings.mjs
```

After reviewing a changed source snapshot, `--sync` downloads only the four
metadata/definition files at `data/records.json`'s pinned revision, validates the
CSV and checksum coverage, and rebuilds the projection and page. It does not
download MOVs. IDs outside the Standard gallery remain visible without a
fabricated gallery link. Source metadata and relationship authority remain on
Hugging Face; this access projection does not change them.

The [drawing photograph view](drawings.html), recording dialog and photograph
filter use one selected-front map: 431 registered drawings and 1,205 Standard
recording joins. At dataset revision ed96dab85dea93af4e3a36785a02b90fdeebb976,
the browser covers 436 drawings and 1,256 Standard recordings. Five new drawings
(51 recordings) explicitly have no selected photograph. Each selected display
is a bounded, normalized JPEG. The common
map and embedded image table are hash-bound inputs; source photographs, display
bytes and work identities remain distinct. Historical references retain their own
evidence and qualifications under Reference details.

Reproduce the display projection and exact JPEG assets from the validated common
candidate (Python `pyarrow` and `Pillow` required):

```console
python tools/export-selected-fronts.py --candidate <candidate-directory> --destination . --assets
```

The candidate directory contains `selected_fronts.json` and its hash-bound
`drawing_photographs.parquet`. The export verifies every cell before writing and
omits private paths and confirmation objects from the public JSON projection.
A changed projection requires an explicit update of the checked hash in
`assets/selected-fronts.js`; it must not be accepted by weakening that check.
Do not apply additional source rotation to these normalized display JPEGs.

`tools/build-drawing-parquet.py` remains a historical export tool for older pinned
site revisions. It rejects revisions containing the new selected-front map to
prevent regeneration from the older primary-reference policy. Current derived
views must use the common candidate. No export tool uploads files.

## Validation

Run the dependency-free checks before publishing:

```console
node --test tests/*.test.mjs
node tools/validate.mjs
```

Keep the canonical dataset and license links as ordinary static HTML anchors,
outside templates and form controls. The source-link check is conservative: it
does not reproduce browser repairs for malformed markup, foreign-namespace
parsing, or declarative shadow roots. Links that rely on those features do not
replace the required ordinary anchors.

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
and network access, then `node tools/generate-record-anchors.mjs` before running
`REQUIRE_PREVIEWS=1 node tools/validate.mjs`. Commit both `previews` and
`assets/record-anchors`; the preview workflow performs these steps in that order.
On `main`, that workflow submits changes on a new `automation/recording-previews-*`
branch and opens a pull request instead of pushing to the protected branch.
It explicitly dispatches **Validate site** on the generated branch (including
strict preview validation); merge only after the required `validate` check passes.
GitHub Actions must be allowed to create pull requests in the repository settings.
A run with no asset changes creates no commit or pull request.

Each silent H.264 preview samples up to four seconds beginning at 82% of the
documented source duration, at 12 frames per second and a 480-pixel long edge.
Two deterministic retry positions handle source files that cannot be read at
the primary position. The browser loads these clips only as they enter view and
keeps them paused when reduced motion is requested. The manifest binds each
preview to its record ID and Hub content identity, so unchanged clips are reused
across source-revision refreshes while new or changed records are regenerated.

## Physical-reference display previews

Every recording card and detail heading has a 48-by-48-pixel decorative anchor taken from
the first frame of that record's existing public motion preview. The complete
set is required by validation; no photograph availability is implied. These
small images load lazily and do not fetch the photograph lookup. Generate them
offline with `node tools/generate-record-anchors.mjs`, using the existing FFmpeg
binary through `FFMPEG_PATH`. The manifest binds every output to its recording,
source preview bytes and existing source integrity reference. Original footage
and all photograph associations remain unchanged. Unchanged outputs are reused;
the generator stages the complete set before replacing the current directory.
An FFmpeg version difference alone does not invalidate verified image bytes.
Image settings, source-preview hashes, recording identities, and output hashes
must still match. The manifest's `processing.ffmpegVersion` is the default encoder
provenance; an entry's optional `ffmpegVersion` overrides it for newly encoded
images from a different toolchain. Reused images retain their original provenance.

Three fixed, decorative photographs in the page heading use separate 48-pixel
WebP derivatives of already published, eligible photographs. Their source
and output hashes are recorded in `assets/visual-anchors/manifest.json`. They add
no recording associations or interactive behavior and do not load the photograph
lookup. The combined image budget is 12 KiB. To regenerate them locally, use
Sharp 0.35.5 with its bundled libvips 8.18.7 and run
`node tools/generate-visual-anchors.mjs`. Existing display JPEGs are reused as
inputs. For a small source without a display JPEG, supply the published JPEG,
named `<source SHA>.jpg`, in `VISUAL_ANCHOR_SOURCE_DIRECTORY`. Input hashes are
checked, existing output bytes are cached, and no network access is used.
Cache reuse also verifies the current local input hash and byte size. Supply the
small published JPEG even for a cache-only build when no display preview exists.
All three images and their manifest are staged together before replacing the
published directory; a failed build preserves the previous complete set.

The retained historical source-reference renderer distinguishes directly
owner-confirmed sources, limited receipt-bound JPEGs, inferred source variants,
supplemental photographs and proposed relationships. Those classifications remain
unchanged in the source lookup and qualified Reference details. They do not
replace the common selected-front map used by the current gallery, recording
dialogs and photograph filter. Supported indirect links still require checked
public premises and a matching processing receipt; other proposals remain
explicitly unverified here.

Documented EXIF orientation is honored exactly once. No rotation, mirroring,
front/back identification, or recording endpoint is inferred from dimensions,
filenames, or a shared work ID. A direct owner identification is accepted as
drawing evidence; the current metadata does not separately attest alignment
relative to the video frame. See [the shared reference policy](REFERENCE_POLICY.md)
for current selected-front handling and the retained historical source rules.

Recording dialogs open the same bounded selected-display JPEG shown inline.
Historical source-photograph links remain in Reference details with their own
source and resolution limits; they are separate from the selected display.
A small display JPEG is not evidence of original-file or fine-detail quality.

For the historical `owner_confirmed_display_derivative` source class, its qualified link opens the
limited public JPEG itself. It does not expose or claim the original photograph
bytes. The pinned source manifest retains the review identifier, public-image
hash, processing specification and limited-resolution class; its confirmation
receipt keeps original-source hashes separate from public display hashes.
The [M002/M055 public confirmation receipt](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/bfa25fb932b8103e83e8c8e96c79b5e99f4c197d/Physical_References/Photographs/Confirmations/2026-10-20-public-display-pilot.json)
binds these two limited JPEGs to their existing works and eight recording IDs.

Historical source previews retain their existing source bindings. Current selected
fronts use the separately generated exact display assets. Other photographs of a
work are not interchangeable with the selected front. The site does not depend
on expiring Dataset Viewer image URLs.

The historical preview generator accepts only the unchanged retained lookup. A
lookup refresh requires an explicit dependency review and corresponding guard
update before regeneration or pruning. For that retained input, generate one
preview per oversized selected source hash:

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

## Selected photograph downloads

The drawing gallery and recording dialogs offer source-bound JPEG downloads from
the main Hugging Face archive. Inline images remain the existing bounded JPEGs.
`data/photograph-downloads.json` pins a separate media revision and binds each
download to the exact selected source hash and work ID. Labels distinguish
native-resolution JPEGs, limited references and supplied source-resolution JPEGs.
Original camera containers remain separate from their extracted renderings.

Validation checks the download-manifest hash and selected-source joins. If that
manifest cannot load, the existing photograph display remains available.
