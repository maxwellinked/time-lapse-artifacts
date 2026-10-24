# Drawing-reference policy

The current gallery, recording dialog and photograph filter share the selected-front
map projected into `data/selected-fronts.json`. It contains one owner-confirmed
front per existing work ID. Its exact bytes are checked before use, and its work-link
input hash must match the retained recording lookup. The image assets are verified
against the selected output hashes; all are limited display JPEGs with normalized
orientation. Four previously approved source rotations are baked into these pixels
and are not applied again by the UI. Two corrected assignments replace the selected
fronts only; historical evidence remains versioned.

The 431 selected fronts join to 1,205 Standard recordings through the existing work
links. This asserts drawing identity and the selected photographed view, not a
recording endpoint, timing calibration, complete process, or original-file quality.
Pre-Standard records receive no invented work or photograph joins.

At dataset revision ed96dab85dea93af4e3a36785a02b90fdeebb976, five additional
registered drawings (51 recordings) are explicitly unselected. They remain
browsable with no selected photograph; no photograph is inherited from another work.

The source-lookup policy below remains the contract for retained historical
reference records and their qualified links. Its old display counts do not count
the new selected-front population; existing relationship classifications are not
silently promoted or rewritten by the display adapter.

## Historical source-lookup acceptance

A displayed reference must identify the same drawing and depicted surface as
the recording. Explicit owner identification is accepted as drawing evidence.
A shared work ID, visual resemblance, filename, or transitive relationship alone
does not establish that identification. Any known contradiction, reverse-side
view, uncertain surface, or conflicting selection excludes the pairing.

For historical source rendering, the retained policy requires all of the following:

| Requirement | Accepted source evidence |
| --- | --- |
| One resolved primary photograph | `selectionStatus = primary_inspection`, exactly one primary candidate, and that candidate is `mainImage` |
| Drawing image | `image_role = drawing_reference`, `view_purpose = primary_inspection` |
| Owner identification | `owner_confirmed / direct_owner_confirmed / owner_direct / direct_confirmation` relationship tuple |
| Identified source representation | `exact_confirmed_source_bytes`, or `owner_confirmed_display_derivative` with the limited public-display contract below |
| Documented inspection representation | Native or limited full-drawing inspection class; never supplemental-only |
| Consistent orientation metadata | Valid EXIF orientation and display dimensions consistent with encoded dimensions |

An inferred export variant is excluded even when another photograph from that
capture was owner-confirmed. A proposed candidate is not promoted because it is
the only available photograph. Multiple primary candidates remain unresolved;
there is no fallback to a convenient supplemental photograph. Excluded images
are absent from the confirmed-reference filter, inline primary image and primary
full-resolution link. Qualified documentation links remain accessible in the
existing Reference details area. Recording playback remains available.

The original source lookup and photograph bytes are preserved as provenance.
Their presence in the archive does not mean they qualify as displayed pairs.

A public display derivative requires the same direct owner-identification tuple,
`limited_resolution_full_drawing_reference`, `public_display_JPEG_bytes_unchanged`,
an explicit review/receipt identifier, normalized orientation 1, a long edge at
most 1024 pixels, and at most 512 KiB. The public JPEG hash identifies the limited
derivative. Original source hashes and bytes remain separate in the source
confirmation receipt. The site labels this class as a public display derivative
and opens the published JPEG without describing it as the original or a
full-resolution source. This acceptance does not promote inferred exports,
historical references, or unconfirmed review candidates.

In the historical `data/physical-references.json` snapshot at Hugging Face revision
`a849eb13c7af60d8b5ac0d7d16a4cd8661f0405d`, the policy retains 624 recording
pairings using 78 unique photographs. Of 963 pairings with a selected
`mainImage`, 339 are withheld from primary display (963 minus 624). The two
unresolved selections have no `mainImage` and are outside that total.

The historical two-work public-display pilot added M002 and M055: eight recording
pairings using two limited JPEGs. That source-lookup snapshot qualified 632
pairings and 80 unique photographs. These are historical eligibility counts,
not the current selected-front coverage; no historical reference class is promoted.

## Qualified documentation access

Reference details can link to a published photograph without making it an
eligible primary. Source variants retain their inferred capture connection;
supplemental photographs retain that role; unresolved candidates are listed
equally without selecting one. These links establish no recording endpoint,
same-surface equivalence, or photograph-to-video alignment.

An indirect reference is labelled supported only when the derived, revision-bound
`data/reference-link-evidence.json` retains checked public premises: an existing
owner-confirmed photograph-to-record reference ID with a source hash, one unique
owner-confirmed recording-to-active-work membership, and a matching processing
receipt for the published photograph. The work-reference projection must not
report unresolved uncertainty. Neither a proposed status nor a transitive label
alone establishes support. This verifies recorded public premises, not the
underlying photographs or owner assertions. Source cautions and surface scope
remain visible; authority and relationship statuses are unchanged.

Before using support claims, the browser compares the evidence's lookup hash
with SHA-256 of the actual loaded lookup bytes. Mixed cached snapshots from the
same Hugging Face revision, or unavailable hashing, retain unverified labels.

If support is unavailable, mismatched, private-only or stale, the link says
**Proposed reference Â· support not verified here**. This does not assert that
private evidence is absent or that a proposal is false. Reproduce the support
snapshot from its pinned public text inputs with
`python -B tools/build-reference-link-evidence.py --check`.

## Orientation

Apply the source's documented EXIF orientation once. For direct source display,
the browser honors the original EXIF; committed display JPEGs have already been
auto-oriented during generation and must not have EXIF applied again. Show the entire
frame without cropping, stretching, or enhancement. Additional display rotation
requires an explicit owner instruction bound to the exact work and photograph.

On 2026-10-20 the owner requested a **90-degree clockwise** display correction
for these four photographs and stated that all other orientations were correct:

| Documented finish | Work ID | Source photograph SHA-256 |
| --- | --- | --- |
| 2026-08-08 | `tlaw-27d91c3c3ca5d9e3` | `c24524fc0dc6a2ae8f05175861733b246cbdf4954e4cedc9c4d80605eb651a42` |
| 2026-08-07 | `tlaw-a77d16972149f232` | `efc4ca40a9f58cf8be4dbcf9add537ddb5b6aaa83cdf404e271e5159df9a6ed1` |
| 2026-08-05 | `tlaw-3c632c55f324b287` | `383812a0374f75bfb4c8285b90c64e3cc836a3dbbf47003b14903fa9b34c92be` |
| 2026-07-08 | `tlaw-ed372076fbc9d7c6` | `f84ae9326d33cabca20f33bd5af6d2149389bd1c0876b36fbebb63365b2b5be2` |

Historical source-image rendering applies these corrections after EXIF. Current
selected-front JPEGs already contain the approved corrections in their pixels;
drawing cards and recording dialogs do not add the CSS rotation again. Historical
source photographs, preview bytes, manifests and links retain their source
orientation. The correction adds no photograph-to-video alignment claim; other
photographs receive no additional rotation.

Do not infer artistic upright orientation from portrait/landscape dimensions,
rotate a photograph to fit a video rectangle, or change archive source bytes
for layout consistency. The current source has no explicit same-face or
photograph-to-video rotation field. The website accepts owner identification
and preserves the documented source orientation; it does not certify a new
frame-relative alignment. An alignment requiring an additional rotation or
surface guess must remain withheld until explicitly reviewed.

## Historical Hugging Face implementation template

1. Bind the recording ID and content identity, photograph SHA-256, and exact
   source revision before deciding eligibility. Re-evaluate when any identity
   changes; never carry a review across different bytes silently.
2. Apply the acceptance rules above to the pair, retaining the owner's original
   assertion and its provenance. Do not upgrade proposed or inferred evidence.
3. If surface or extra alignment needs review, record an explicit owner or
   documented review assertion for the same depicted drawing surface. Record
   any approved additional quarter-turn relative to the recording separately
   from EXIF. Missing or conflicting review evidence excludes that pair.
4. Publish only eligible photographs in the paired drawing-reference view.
   Reverse sides and other excluded material may remain in a separate provenance
   archive, but must not appear as drawing references or automatic fallbacks.
5. Preserve the canonical media and manifest. Any display derivative must bind
   to the exact source hash, record its processing, normalize EXIF once, retain
   the whole frame, and avoid inferred alignment or image enhancement.
6. Validate source bindings, unique primary selection, exclusion of proposed,
   inferred, supplemental, reverse/uncertain, and unresolved cases, plus rotation
   handling and identical eligibility across filters, dialogs, and exports.

An omitted reference means no eligible drawing reference is shown. It does not
assert that the archive contains no photograph, that the work is unidentified,
or that a photograph documents the recording's endpoint.
