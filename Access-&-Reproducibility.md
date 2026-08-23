# Access & Reproducibility

## Dataset Size & Logistics

The active 490-video release contains **1,984,749,320,057 bytes** of video:
- Approximately **1.98 TB** (decimal)
- 1.81 TiB (binary)
- Canonical files are often several gigabytes each

**Recommendation**: Select records through `metadata.csv` before downloading video.

## Bandwidth-Safe Quick Start

Install Hugging Face Datasets, stream the archive, and disable decoding:

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

```python
dataset = load_dataset(
    "maxwellinked/time-lapse-artifacts",
    "pre_standard",
    split="archive",
    streaming=True,
)
```

### Full Decoding

Default decoded row access additionally requires:
- `torchcodec`
- A compatible video-decoding stack

Use `streaming=True` unless a full archive download is intentional.

## Reproducibility Best Practices

### Essential Documentation

For reproducible work, **always**:

1. **Pin a repository commit or release tag**
2. **Record the selected `record_id` values**
3. **Preserve the published `hub_xet_hash` values**
4. **State whether audio was retained**
5. **Document all rotation, crop, sampling, decoding, and proxy-generation steps**

### Validation Before Publishing Changes

Run the included validator before publishing a metadata change:

```bash
python tools/validate_metadata.py metadata.csv \
  --pre-standard-metadata Pre_Standard_Time_Lapses/metadata.csv
```

## Tools for Advanced Usage

### enrich_prestandard.py

Reproduces Pre-Standard technical fields from a pinned Hub inventory and MP4 container headers:

```bash
python tools/enrich_prestandard.py
```

**How it works**:
- Uses HTTP range requests through FFmpeg
- Does **not** intentionally download complete videos
- Efficiently extracts header metadata

### capture_hub_inventory.py

Records corresponding Xet file IDs from resolve headers:

```bash
python tools/capture_hub_inventory.py
```

**How it works**:
- Resolves Hub file identities
- Does **not** follow redirects or transfer video payloads

### repair_metadata.py

Regenerates v0.2 index from source plus audited additions:

```bash
python tools/repair_metadata.py source_metadata.csv metadata.csv \
  --additions tools/metadata_additions_v0.2.csv
```

## Identifier Stability

### record_id as Primary Identity

- **Stable identity**: `record_id` (persistent across updates)
- **Mutable**: Filename (may be corrected without creating new conceptual record)
- **Mutable with documentation**: Content (replacement must retain provenance, should receive new content hash)

### Versioning

The repository is under **active construction**. Version tags are immutable:

- **v0.3.0**: 467 rows (338 Standard, 129 Pre-Standard)
- Later versions documented in CHANGELOG.md

## Intended Uses

### Reasonable Uses

- Archival and drawing-process research
- Qualitative within-creator analysis of practice and skill development across repeated physical-media sessions
- Self-supervised video representation experiments
- Frame-change, scene, and workspace analysis
- Development of annotation and tracking methods

### Uses Requiring Additional Validation or Calibration

- Hand or pen-tip tracking
- Optical-flow comparison across acquisition eras
- Temporal behavior analysis
- Real-world trajectory, velocity, acceleration, or motor-control measurement

**Note**: The release does **not** currently provide:
- Capture intervals
- Acceleration factors
- Source-frame timestamps
- Camera calibration
- Pixel-to-physical coordinate mapping
- **Encoded time-lapse playback must NOT be treated as real drawing time**

### Not Validated

- Population-level claims about artists or drawing behavior
- Clinical, biometric, authorship, or identity inference
- Leakage-safe training or evaluation benchmark
- Commercial use outside CC BY-NC 4.0 terms

## Hub Configuration

The Hub configurations use the split name **archive**. No official train/validation/test partition has been defined.
