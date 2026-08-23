# Overview & Quick Start

## Dataset Overview

time-lapse-artifacts documents analog drawing processes across different recording periods and acquisition conditions. Raw video is the primary record. Metadata identifies, organizes, compares, and documents recordings without imposing aesthetic scores or stylistic labels.

The collection is a **single-creator longitudinal archive**. This makes it useful for studying within-practice change, but it does not represent artists, materials, studios, or drawing practices broadly.

## Current Release State

### Main Branch (Current)
- **490 total rows**: 362 Standard + 128 Pre-Standard
- **Date coverage**: 2025-07-13 to 2026-08-22 (Standard); 2024-09-17 to 2025-07-09 + 9 unknown dates (Pre-Standard)
- **Metadata state**: Complete core technical metadata for all files

### Version History

- **v0.1**: 465 rows (335 Standard, 130 Pre-Standard)
- **v0.2**: Added 3 unindexed Standard files, removed 1 Pre-Standard row that didn't meet ownership/provenance threshold
- **v0.3**: Added stable Pre-Standard identities and technical metadata
- **Post-v0.3**: Provenance corrections, 17-record ingestion, July 13 promotion
- **Latest**: August 2026 additions bringing total to 490 rows

## Bandwidth-Safe Quick Start

Install Hugging Face Datasets, stream the archive, and disable decoding while selecting records:

```python
from datasets import Video, load_dataset

dataset = load_dataset(
    "maxwellinked/time-lapse-artifacts",
    "canonical",
    split="archive",
    streaming=True,
)
metadata = dataset.cast_column("video", Video(decode=False))
first = next(iter(metadata))
print(first["video"]["path"], first["tool"], first["medium"])
```

This exposes the complete metadata schema **without transferring video bytes**. 

### For Pre-Standard Tier

Simply change the configuration name:

```python
dataset = load_dataset(
    "maxwellinked/time-lapse-artifacts",
    "pre_standard",
    split="archive",
    streaming=True,
)
```

## Configuration Details

The release exposes two explicit configurations:

- **canonical/archive** (default): Loads `metadata.csv` with 362 Standard files from `Standard_Time_Lapses/`
- **pre_standard/archive**: Loads `Pre_Standard_Time_Lapses/metadata.csv` with 128 Pre-Standard files

Each configuration has the same 29-column schema. Metadata-complete canonical records are kept separate from less-complete Pre-Standard records.

## Collection Tiers

| Collection tier | Published MP4s | Indexed rows | Date coverage | Metadata state |
|---|---|---|---|---|
| **standard** | 362 direct files | 362 | 2025-07-13–2026-08-22 | Complete core technical metadata for every direct Standard file |
| **pre_standard** | 128 | 128 | 2024-09-17–2025-07-09, plus 9 unknown dates | Complete core technical metadata; historical descriptive and provenance gaps remain |
| **Earlier archive (unpublished)** | 0 public videos | 0 | Historical scope 2012–2016 | More than 8 TB held outside this release; ingestion pending |

## Decoding & Visualization

Default decoded row access requires `torchcodec` and a compatible video-decoding stack. Use `streaming=True` unless a full archive download is intentional.

**Tip**: Select records through `metadata.csv` before downloading video, as canonical files are often several gigabytes each.
