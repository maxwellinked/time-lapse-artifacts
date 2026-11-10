# Native Companion Browser Navigation

**Goal:** A visitor can open either published native companion, select a frame, inspect its full native pixels, and reach its pinned provenance.

**Scope:** Two recordings and 42 frames already published at derived revision `4b0870f45eac36c53b1084305934471ee8dd273b`. No Hugging Face mutation, archive index refresh, preview regeneration, work assignment or historical-inspector migration.

**Chosen design:** Add a small `inspection/native.html` inspector with its own source-bound data projection. Link it from the existing inspection page and from the matching Standard recording dialog. The companion page lists both recordings, including the Pre-Standard recording absent from the Standard overview. Keep the nine-record inspector and saved-location contracts intact.

**Alternatives considered:** A pack-file link alone leaves visitors navigating filenames and manifests manually. Appending the new records to the historical inspector conflicts with its global source revision, nine-frame wording and non-null work-ID assumptions. The separate bounded inspector reuses the existing visual vocabulary while preserving those contracts.

**Constraints:**

- Hugging Face source and derived repositories remain authoritative; GitHub retains a reproducible projection only.
- Query routes select an exact record and frame. Invalid/ambiguous routes show unavailable state with no substituted image.
- All 21 targets remain. Native PNGs load only for the selected frame; no eager source/proxy playback.
- Native and earlier JPEG profiles have different timestamp bases; do not use JPEGs as equivalent-frame thumbnails.
- Preserve documentary nulls as unresolved in the pinned pack, without implying current archive-wide identity status.
- Exact timestamp, image identity and provenance links update together on selection. Error/loading states hide the prior frame.

## Tasks

- [ ] Independently generate and verify source-bound projection/index from retained published JSON snapshots; meaningful tamper tests, RED then GREEN.
- [ ] Implement and test strict route/model and identity-guarded overview link, RED then GREEN.
- [ ] Build native inspector, selected-image controls and provenance; link existing entry points.
- [ ] Verify rendered desktop/mobile paths, invalid routes, frame/image binding, load failures and lazy media behavior.
- [ ] Run complete repository checks; fresh independent review; scoped PR, Linux CI, guarded merge, Pages deployment and live verification.

## Evidence ledger

Baseline GitHub `95ad8b8717cd641e4a21fb2c517afe6a47724f2f`. Fresh complete isolated checkout: `work/inspection-browser-20261110`, branch `inspection-native-navigation`. Initial filtered clone could not materialize missing blobs; reused a complete local object store in a new clone and fetched the current public baseline. No shared checkout was edited.

User authorized working on the public-browser journey while present. This is the concrete narrow navigation implementation within that request.
