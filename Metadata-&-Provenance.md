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
