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

- [x] Independently generate and verify source-bound projection/index from retained published JSON snapshots; meaningful tamper tests, RED then GREEN.
- [x] Implement and test strict route/model and identity-guarded overview link, RED then GREEN.
- [x] Build native inspector, selected-image controls and provenance; link existing entry points.
- [x] Verify rendered desktop/mobile paths, invalid routes, frame/image binding, load failures and lazy media behavior.
- [ ] Run complete repository checks; fresh independent review; scoped PR, Linux CI, guarded merge, Pages deployment and live verification.

## Evidence ledger

Baseline GitHub `95ad8b8717cd641e4a21fb2c517afe6a47724f2f`. Fresh complete isolated checkout: `work/inspection-browser-20261110`, branch `inspection-native-navigation`. Initial filtered clone could not materialize missing blobs; reused a complete local object store in a new clone and fetched the current public baseline. No shared checkout was edited.

User authorized working on the public-browser journey while present. This is the concrete narrow navigation implementation within that request.

Implementation `ec792d8`: 11 projection tests and four route/link tests observed RED before implementation; 22 focused tests including existing dialog integration passed. Rendered Chrome desktop and actual 390px mobile journeys passed. Network/error checks confirmed selected PNG loading only, no eager source/proxy requests, retry of the same failed sample, and no substitution for invalid routes. Root inspected both desktop/mobile screenshots. A lowercase collection-tier mismatch was caught by the rendered test and corrected.

Fresh independent `browser_review` found no blocking issues; independently exercised stale-image callbacks, wrong decoded dimensions and invalid-route handling. No deferred findings.

Initial Windows checkout line-ending conversion was corrected back to exact committed bytes. Final local Node run: 256/269 passed, all 13 remaining failures already present in the baseline (POSIX executable/shell fixtures and Windows symlink permission). Linux validation passed all 269 JavaScript tests, the native projection check, 64 Python tests and strict site checks. Source/image/archive media inputs retained their prior identities.

First Linux pinned-reproduction run caught two outputs bound by the existing photograph export receipt: changed `index.html` and the application digest in `data/photo-selection-projection.json`. Native cache generation now uses a separate `native` query parameter, preserved by the photograph exporter. Regenerated the receipt with the existing exporter at the unchanged photograph source revision `202226b18431f67f879629d8f49d72883643f810`; only application/index output hashes and sizes change. All selected photographs and source inputs remain identical. The five photograph reproduction tests then passed locally, including full historical replay.
