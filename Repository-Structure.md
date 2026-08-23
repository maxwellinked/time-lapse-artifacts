# Repository Structure

## Directory Layout

### Standard_Time_Lapses/

The primary directory contains **362 direct MP4 files** organized as the canonical collection.

**Key points**:
- `metadata.csv` is the complete machine-readable canonical index
- Every direct file has one validated row with core technical metadata
- Direct file placement alone is not sufficient for future additions; metadata and release validation are required

#### Canonical Metadata Fields

Each canonical metadata row includes:

- Persistent `record_id`
- `collection_tier = standard`
- `is_canonical = true`
- `acquisition_protocol_version = standard-2025-07-13`
- Descriptive session fields
- Encoded video properties
- Repository content hash and size
- Provenance fields (where documented)

#### Filename Convention

Files use a structured filename convention (see SCHEMA.md for details). **Important**: A filename is descriptive, but it is **not** the stable identity of a record. External references should use `record_id`.

### Standard_Time_Lapses/Provenance/

This subtree contains **supporting historical records and retained exceptions**. It is **not** part of the canonical record set.

#### 2026-07-31/

Preserves the completed provenance release, including mappings between historical `Series_9x12` filenames and canonical records. Relationships are preserved through mappings, hashes, metadata, and repository history.

#### Unresolved_Series_9x12/

Contains distinct historical recordings that do not yet have enough documentation for promotion into the canonical collection.

### Pre_Standard_Time_Lapses/

Contains **128 recordings** that predate the standard acquisition protocol.

**Key characteristics**:
- Published for archival continuity
- **Not** interchangeable with canonical standard records
- Each has a stable `record_id`, exact Hub content hash, size, and playback duration
- Complete core technical metadata (dimensions, frame rate, codec, pixel format, container, audio presence)
- Historical dates, times, materials, and provenance remain **incomplete** where evidence is unavailable
- Missing values must **not** be interpreted as zero, false, or evidence that a property was absent

#### Metadata Index

`Pre_Standard_Time_Lapses/metadata.csv` is the active index loaded by the `pre_standard/archive` configuration. It follows the same 29-field schema as the canonical index while leaving undocumented historical fields empty.

**Material that does not meet the archive's ownership and provenance threshold is excluded** from both published media and the active metadata index.

### Earlier_Archive_2012_2016/

**Status**: Not part of current public release

- More than 8 TB of earlier material held outside this dataset
- Consists primarily of uploaded 1080p drawing videos with some livestream-derived material
- Ingestion pending
- References to 2012–2016 describe archive scope, not current downloadable coverage

## File Formats & Schema

### Metadata CSV Structure

- **29-column schema** (same for both Standard and Pre-Standard)
- Stored dimensions and byte sizes: nullable integers
- `has_audio`: nullable boolean
- `encoded_frame_rate`: float (because historical encodings include fractional rates)
- Undocumented values load as null (not zero or false)
- Tier membership declared directly in each row

### Video Files

- **Format**: MP4 (direct files)
- **Typical size**: Several gigabytes for canonical files
- **Audio**: Nearly all published masters retain an audio stream
- **Metadata**: `has_audio` records stream presence only; does not establish meaningful signal

## Related Documentation

- **SCHEMA.md** — Filename and metadata contracts
- **Archive_Specifications.md** — Acquisition specifications and known gaps
- **VALIDATION.md** — Validation scope and current results
