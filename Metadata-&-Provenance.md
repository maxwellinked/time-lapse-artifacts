> [!WARNING]
> **Historical documentation snapshot: August 23, 2026**
>
> The historical text below is preserved from the August 23, 2026 documentation snapshot. Its counts, schema, and workflow descriptions may be outdated.
>
> For current archive information, see the [Hugging Face dataset](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts). For current field definitions, see [SCHEMA.md](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/main/SCHEMA.md).

# Metadata & Provenance

## What Provenance Means

In this dataset, **provenance** refers to the **documented relationship between a physical drawing and its time-lapse record**, rather than to histories of ownership or sale.

## Metadata Philosophy

The metadata distinguishes:
- **Documented facts**
- **Established historical relationships**
- **Unresolved information**

Uncertain relationships are **not** promoted to verified relationships solely because dates or filenames look similar.

## Evidence Base

Metadata may include:
- Exact file/blob identity
- Original filenames and repository paths
- File sizes and hashes
- Duration comparison
- Visual continuity across recordings
- Documented physical references
- Repository commit history

## Annotation State

### Session-Level Curation

Session-level descriptive and provenance metadata are **curated by the creator** from:
- The physical practice
- Filenames
- File properties
- Retained historical evidence

### Scope of Creator Annotations

- `annotations_creators`: expert-generated (creator-curated)
- **Does not** mean frame-level task labels exist
- `language: en` describes filename vocabulary, metadata, and documentation (not incidental audio)

### Video Classification Task

The video-classification task facet refers to possible session-level targets such as:
- Documented tool
- Medium
- Support

**Note**: The release does **not** define label encodings, an official benchmark, or train/validation/test partitions.

## What's NOT Provided

The videos themselves are primarily **raw and unannotated**. The release does not provide:

- Frame-level bounding boxes or segmentation masks
- Hand, pen-tip, pose, or stroke labels
- Aesthetic or quality scores
- Imposed stylistic classifications
- Calibrated physical trajectories
- Original capture timestamps for individual time-lapse frames

**Researchers may derive annotations**, but derived labels should identify the source `record_id` and pinned repository revision.

## Metadata Encoding

### Multiple Values

The active CSV files and live Viewer use **semicolons** for multiple tool and medium values:

```
Example: Pencil;FountainPen
Example: Graphite;Ink
```

**Important**: A pipe (|) is **not** a valid separator (as of v0.2). The two fields are independent observed-value lists; equal list lengths and positional pairing are **not** guaranteed. See SCHEMA.md for details.

### Frame Rate & Temporal Concepts

**`encoded_frame_rate`** is the **encoded playback rate**. It is **NOT** the original temporal sampling rate of the drawing process.

## Acquisition & Video Orientation

### Protocol Version

The acquisition protocol effective **July 13, 2025** is documented in Archive_Specifications.md.

### Orientation Distinction

The protocol's **capture orientation** and a file's **stored pixel orientation** are different concepts:
- `orientation`, `width_px`, and `height_px` metadata describe the **published encoded file**
- Historical canonicalization may include rotation, crop, or transcode
- Transformations are documented only where evidence currently exists
- **Must not** be inferred from dimensions alone

### Protocol Boundary as Metadata

The July 13, 2025 protocol boundary is **explicitly encoded** in canonical metadata. It:
- Supports era-aware comparison of repeated physical-media practice
- Is an **acquisition change**, not a skill-change label
- Differences across boundary may reflect capture conditions as well as practice development

## Data Completeness

### Standard Tier (362 rows)

- **Complete core technical metadata** for every direct Standard file
- Consistent acquisition conditions since July 13, 2025
- Full provenance documentation

### Pre-Standard Tier (128 rows)

- **Complete core technical metadata**
- Historical descriptive and provenance gaps remain
- Missing values must **not** be interpreted as zero, false, or evidence of absence
- Published for archival continuity

### Published-Index Definition

Published-index completeness is defined by:
- 362 rows in `canonical/archive` + 128 rows in `pre_standard/archive`
- Their generated Parquet exports
- Hugging Face's column Statistics job is auxiliary and asynchronous; its availability is **not** used to claim/reject row-level completeness

## Validation & Quality Assurance

Run the included validator before publishing a metadata change:

```bash
python tools/validate_metadata.py metadata.csv \
  --pre-standard-metadata Pre_Standard_Time_Lapses/metadata.csv
```

### Related Tools

- **`tools/enrich_prestandard.py`** — Reproduces Pre-Standard technical fields from pinned Hub inventory and MP4 container headers (uses HTTP range requests; does not download complete videos)
- **`tools/capture_hub_inventory.py`** — Records Xet file IDs without following redirects or transferring payloads
- **`tools/repair_metadata.py`** — Regenerates index from source plus audited additions

## Media filename convention

The source naming policy is maintained on Hugging Face in [Media_Naming/README.md](https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/main/Media_Naming/README.md) and its checksum-bound rename map. Readable media names begin with their documented date/time context, followed by the media role and recording number where known. Photograph labels describe associated recording context, not photograph capture time. Candidate pairings, unknown dates/times, and multiple documented labels remain explicit. Original filenames, permanent IDs and media bytes are retained.

`tools/migrate-media-names.py` prepares a bounded browser update from an immutable source migration commit and an immutable browser baseline. It verifies old/new LFS object identities, preserves selection and relationship evidence, copies authoritative download metadata with its declared media pins, updates current access bindings and cache versions, and preserves local derivative media bytes. Rebuild the real-time and photograph clarification pages and run the full validation suite before publishing the browser. Historical source URLs keep their original revision/path pairs.

Current additive reproduction binds Hugging Face `4f563085afacfc454496ac2d61606614268b2cb8` to browser baseline `19ac65ee020f8b40c332fb5e1bb022b1610f99b1`. `tools/refresh-additive-projection.py` checks all existing complete metadata rows and relationship inputs, preserves the corrected lookup/evidence and appends 47 explicit unlinked entries, giving 1,303 Standard rows. New work IDs remain blank, image references remain null and no recording-start declarations are inferred. The exact source pin, prior population and byte bindings are retained in `data/source-refresh.json`; `browserBase` identifies preparation history rather than the commit containing newly generated bytes.

The separate historical reproduction starts from creator-corrected browser baseline `bfe047340508ef4cbb9c685bca72a632b5b6fccb` and Hugging Face migration commit `12d5713326886bc18669f2a5c571c4fe7ac1fb73`. Its original 18 outputs are compared against the retained browser snapshot. The rename map binds source base `253e2ad859ea93b183110f19b5bbd78fc0bd6289`; the authoritative download index separately declares media at `dcfe6cb22fe20bc6677464875f2333600f32bf64`. The [pinned verification instructions](README.md) use committed Git metadata and LFS identities without downloading media payloads; partial clones may fetch missing pinned metadata and pointer objects during a check. The integration tests verify the current additive projection, historical migration and retained derivative bytes, not the original private candidate selection or JPEG encoding recipe. Future source or selection publications require explicit review and updates to the reproduction pins while preserving the exact comparisons.

The earlier correction and five-master overlay remains a separate historical stage: `tools/extend-selected-fronts.py` binds the exact seven source inputs and five materialized masters at Hugging Face commit `253e2ad859ea93b183110f19b5bbd78fc0bd6289` to browser baseline `26392f5c981f1d3207414f819c88ab8dbd8dc30f`. It retains 430 surviving candidate displays and their evidence while applying the explicit creator correction. Re-encoding its five derivatives requires the recorded Pillow 12.2.0, JPEG 8.0 and LittleCMS 2.18 toolchain. Its historical row and evidence guards remain binding; current renamed inputs belong to the migration stage. Neither stage changes authoritative Hugging Face metadata or transfers historical evidence to new source bindings.
