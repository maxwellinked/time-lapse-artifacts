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

## Source authority

**Hugging Face owns the data and metadata. GitHub consumes and presents them.**
The canonical dataset holds recording facts, field definitions, relationships,
and evidence qualifications. Its derived repository holds published evidence
derivatives. This repository supplies a lightweight browser and reproducible,
revision-pinned access projections.

A metadata enrichment is completed in the Hugging Face indexes, schemas,
validators, and affected dataset exports first. The browser then reads and
validates those published fields. A browser-only label or JSON field does not
complete a source-metadata change. Retained source snapshots and display assets
remain derived access aids. See [project guidance](AGENTS.md).

## Recording mode and real-time evidence

The [real-time recording list](real-time-recordings.html) exposes the separately
indexed MOV collection and all of its original metadata values in
[`data/real-time-recordings.json`](data/real-time-recordings.json). Each entry
retains its published candidate relationship, timing basis, source-role status,
demux result and notes. Standard recording dialogs link to their listed
real-time candidates. A candidate does not inherit the time-lapse record's work
identity, photograph or finish label.

`recordingMode` in the Standard browser index is `time_lapse`; `recording_mode`
in the real-time projection is `real_time`. Both import the source CSV's explicit
`recording_mode` when present and reject blank or contradictory source values.
Older pinned source indexes without that column retain a documented-collection
fallback. These values are separate from file extension, encoded frame rate and the
existing `captureType` field, which is retained as the acquisition-protocol
version for compatibility. Dialogs label that value **Acquisition protocol**.
Durations are labeled as encoded video duration.

The real-time projection preserves every source CSV field as a string, including
blank values and an explicit source recording mode. Its `recordingModeBasis` is
`source_metadata` when the source supplies the field; older pinned inputs use
`documented_collection` and add only that derived mode. Its source revision
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
filter use one selected-front map: 435 active registered drawings and 1,256 Standard
recording joins. The current Standard index contains 1,303 recordings at Hugging Face
revision `4f563085afacfc454496ac2d61606614268b2cb8`. Its 47 additions have no assigned
work IDs or photograph links; they remain available in the recording browser and
are omitted from registered-drawing grouping. File counts do not establish the
number of drawings or complete sessions. The 430 surviving earlier displays retain their exact candidate bytes.
Five additional displays (51 recording joins) are bounded derivatives of the
owner-confirmed fronts in the separate Hugging Face master release, at the exact
revision recorded in `data/selected-fronts.json`. The projection records the original
candidate's hashes and a separate hash-bound master supplement; the original
embedded image table still covers 431 works. Each selected display is a bounded,
normalized JPEG. Source photographs, display bytes and work identities remain
distinct. Historical references retain their own evidence and qualifications
under Reference details.

The creator confirmed that the July 25 recordings at 10:17 and 19:16 show two
stages of one physical drawing. Both now join `tlaw-858a03eb138fbf47` and share its
existing selected display. Superseded ID `tlaw-b03bbfba8babbf3d` and its former
selection remain in the immutable Git baseline. The explicit current-identity
overlay binds the new Hugging Face registry, correction ledger and creator note;
the original photograph evidence and video-source revision pins retain their
historical scope. Recording IDs, media bytes and documented times are unchanged.

Verify the current projection from a full-history checkout of this browser and a
metadata-only Git clone of the authoritative Hugging Face repository. Preserve
committed line endings and skip LFS media downloads:

```console
GIT_LFS_SKIP_SMUDGE=1 git -c core.autocrlf=false clone --filter=blob:none --no-checkout https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts /path/to/hf-git
GIT_LFS_SKIP_SMUDGE=1 git -C /path/to/hf-git fetch origin 4f563085afacfc454496ac2d61606614268b2cb8 12d5713326886bc18669f2a5c571c4fe7ac1fb73 253e2ad859ea93b183110f19b5bbd78fc0bd6289 dcfe6cb22fe20bc6677464875f2333600f32bf64
python3 -B tools/refresh-additive-projection.py --source-root /path/to/hf-git --source-revision 4f563085afacfc454496ac2d61606614268b2cb8 --browser-root . --browser-base 19ac65ee020f8b40c332fb5e1bb022b1610f99b1 --generated-at 2026-10-29 --expected-additions 47 --output . --check
HF_SOURCE_ROOT=/path/to/hf-git python3 -B tools/test-pinned-reproduction.py
```

The current additive check starts from browser baseline
`19ac65ee020f8b40c332fb5e1bb022b1610f99b1`. It preserves the corrected lookup and
all existing relationship inputs and adds only the 47 explicitly unlinked rows.
`data/source-refresh.json` records the exact source pin, generation date, prior
population and byte bindings; its browser baseline is not a commit containing the
new records. The separate historical check reproduces the original 18 migration
outputs against the retained browser snapshot, starting from creator-corrected
baseline `bfe047340508ef4cbb9c685bca72a632b5b6fccb`. The source migration's base is
`253e2ad859ea93b183110f19b5bbd78fc0bd6289`; the authoritative download index also
declares media at `dcfe6cb22fe20bc6677464875f2333600f32bf64`. Keep all three source
commits and their ancestry available. The checks read committed Git blobs and
local browser files and use only Python's standard library and Git. Partial Git
clones may fetch missing pinned metadata and LFS pointer objects during a check;
no media payloads are downloaded. The pinned-input CI job runs the same
integration checks, plus two unchanged source-ledger path/symlink guard tests on
Linux. These verify the current additive projection, exact historical migration
and retained display bytes; they do not reconstruct the original candidate selection or encode JPEGs.
Future source or selection publications require explicit review and updates to
the reproduction pins, preserving the exact comparisons.

The earlier stages can be reconstructed separately in isolated destinations.
The original display export requires the private validated common candidate and
Python `pyarrow` and `Pillow`:

```console
python tools/export-selected-fronts.py --candidate <candidate-directory> --destination <historical-browser-directory> --assets
```

The candidate directory contains `selected_fronts.json` and its hash-bound
`drawing_photographs.parquet`. The export verifies every cell before writing and
omits private paths and confirmation objects from the public JSON projection.
A changed projection requires an explicit update of the checked hash in
`assets/selected-fronts.js`; it must not be accepted by weakening that check.
Do not apply additional source rotation to these normalized display JPEGs.

To check the later creator correction and five-work supplement, use a separate
browser checkout at `bfe047340508ef4cbb9c685bca72a632b5b6fccb` that also retains
Git baseline `26392f5c981f1d3207414f819c88ab8dbd8dc30f`. Its separate Hugging Face
source checkout must be at `253e2ad859ea93b183110f19b5bbd78fc0bd6289`, with the
seven `SOURCE_INPUTS` paths in `tools/extend-selected-fronts.py` unchanged from
that commit. Materialize the five exact published masters at the paths named by
that revision's download index; LFS pointer files alone are insufficient. Exact
JPEG reproduction requires Pillow 12.2.0, JPEG 8.0 and LittleCMS 2.18:

```console
python3 /path/to/browser-overlay/tools/extend-selected-fronts.py --source-root /path/to/hf-overlay --source-revision 253e2ad859ea93b183110f19b5bbd78fc0bd6289 --destination /path/to/browser-overlay --check
```

To regenerate that historical stage, omit `--check` in the isolated browser
checkout, then run `node tools/build-photograph-clarifications.mjs` there. Do not
run this stage against the current renamed source or current browser output.
The tool verifies the exact committed input bytes, owner receipts, all five master
hashes, source/work joins, supersession and existing recording memberships before writing.
It applies EXIF orientation once, converts to sRGB, fits the complete frame within
1024 pixels without upscaling or cropping, and saves quality-82 JPEGs. It preserves
the 430 surviving earlier selections and display assets. Full-size masters stay on Hugging
Face. The source index retains null display hashes for the five additions; their
new display hashes belong only to this derived access projection.

The same tool removes 38 exact JPEG copies by reusing their existing selected-front
paths. `reference-previews/manifest.json` retains each historical source binding,
output hash and dimensions, with an explicit `assetPath` for shared bytes.
`assets/reference-preview-paths.js` is the generated, validated local-path map used
by the browser and preview tools. Obsolete current assets are retired; old Git
revisions preserve their paths and bytes. No source photograph authority changes.

`tools/build-drawing-parquet.py` remains a historical export tool for older pinned
site revisions. It rejects revisions containing the new selected-front map to
prevent regeneration from the older primary-reference policy. Current derived
views follow the pinned overlay and migration stages above. No export tool uploads files.

## Validation

Run the dependency-free checks before publishing:

```console
node --test tests/*.test.mjs
node tools/validate-image-dedup.mjs
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

The historical photograph lookup generator's `--check` also requires the Git objects for
the lookup's `githubRevision` and Hugging Face `sourceRevision`. Use full-history
checkouts, or fetch the required commits and ancestry before checking a shallow
checkout. Inputs must retain their committed bytes; clone with
`-c core.autocrlf=false` when local Git settings would convert line endings. A
missing baseline object does not mean that the recorded baseline is invalid or
should be replaced. Use the pinned migration and integration commands above for
current verification. The historical overlay's guards and evidence pins retain
their original scope; a later filename migration does not authorize relaxing
those guards or transferring historical evidence to new bindings.

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
An entry's optional full-SHA `media_revision` overrides the historical default.
The five new entries resolve the published master-release ref to its exact commit;
the 430 surviving earlier row objects and download URLs are preserved. `source_index`
records the published manifest's exact revision, path and SHA-256.

Validation checks the download-manifest hash and selected-source joins. If that
manifest cannot load, the existing photograph display remains available.
