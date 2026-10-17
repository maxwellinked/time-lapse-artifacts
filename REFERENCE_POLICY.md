# Drawing-reference policy

This is the reference-display policy implemented by the GitHub website and a
template for applying the same acceptance rules to the Hugging Face dataset.
It does not claim that the Hugging Face repository has been changed.

## Acceptance

A displayed reference must identify the same drawing and depicted surface as
the recording. Explicit owner identification is accepted as drawing evidence.
A shared work ID, visual resemblance, filename, or transitive relationship alone
does not establish that identification. Any known contradiction, reverse-side
view, uncertain surface, or conflicting selection excludes the pairing.

For the current source schema, the website requires all of the following:

| Requirement | Accepted source evidence |
| --- | --- |
| One resolved primary photograph | `selectionStatus = primary_inspection`, exactly one primary candidate, and that candidate is `mainImage` |
| Drawing image | `image_role = drawing_reference`, `view_purpose = primary_inspection` |
| Owner identification | `owner_confirmed / direct_owner_confirmed / owner_direct / direct_confirmation` relationship tuple |
| Exact identified photograph | `source_binding_method = exact_confirmed_source_bytes` |
| Documented inspection representation | Native or limited full-drawing inspection class; never supplemental-only |
| Consistent orientation metadata | Valid EXIF orientation and display dimensions consistent with encoded dimensions |

An inferred export variant is excluded even when another photograph from that
capture was owner-confirmed. A proposed candidate is not promoted because it is
the only available photograph. Multiple primary candidates remain unresolved;
there is no fallback to a convenient supplemental photograph. Excluded images
are absent from the drawing-reference filter, inline image, full-resolution
link, and additional-photograph links. Recording playback remains available.

The original source lookup and photograph bytes are preserved as provenance.
Their presence in the archive does not mean they qualify as displayed pairs.
As of the pinned source snapshot, the policy retains 303 recording pairings
using 40 unique photographs and withholds 660 formerly displayed pairings.

## Orientation

Apply the source's documented EXIF orientation once. For direct source display,
the browser honors the original EXIF; committed display JPEGs have already been
auto-oriented during generation and must not be rotated again. Show the entire
frame without cropping, stretching, or enhancement. Apply no additional rotation
or mirroring beyond the documented EXIF transform.

Do not infer artistic upright orientation from portrait/landscape dimensions,
rotate a photograph to fit a video rectangle, or change archive source bytes
for layout consistency. The current source has no explicit same-face or
photograph-to-video rotation field. The website accepts owner identification
and preserves the documented source orientation; it does not certify a new
frame-relative alignment. An alignment requiring an additional rotation or
surface guess must remain withheld until explicitly reviewed.

## Hugging Face implementation template

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
