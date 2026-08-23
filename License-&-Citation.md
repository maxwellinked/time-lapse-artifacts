# License & Citation

## License

The dataset is released under **CC BY-NC 4.0**.

### License Scope

The license applies only to material for which the licensor holds the necessary rights. Users must conduct their own review of incidental third-party content and downstream use.

**This statement does not independently grant rights in:**
- Incidental third-party material that may appear on screens
- References visible in recordings
- Captured audio
- Other third-party content in the video frame

## Rights & Ownership

The creator confirms ownership of the published video files and depicted creator-owned drawings.

**Material that cannot pass the ownership and provenance review is:**
- Not part of the active public index
- Not distributed by this release

## Privacy, Audio & Content Review

### Audio in Published Videos

Nearly all published masters retain an audio stream. **Important**:

- `has_audio` records stream presence only
- It does **not** establish that the stream contains meaningful signal
- Users are responsible for reviewing audio content

### Content Review Responsibility

**Before redistribution or model release, users must review:**

- Audio content
- Visible screens and references
- Reflections and background objects
- Potentially identifying physical features (e.g., tattoos)
- Other third-party content in frame

### Future Proxy Release

A future proxy release should remove audio by default while preserving the archival masters.

## Citation

Until a DOI-backed release is available, cite the dataset and pinned revision:

### BibTeX Format

```bibtex
@dataset{maxwellinked_time_lapse_artifacts_2026,
  author    = {maxwellinked},
  title     = {time-lapse-artifacts},
  year      = {2026},
  publisher = {Hugging Face},
  url       = {https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts},
  note      = {Active construction release; include the repository revision used}
}
```

### Citation Requirements

**Always include**:
- The repository revision (commit SHA or tag) used
- Selected `record_id` values if using a subset
- Pinned `hub_xet_hash` values for specific files
- Documentation of any preprocessing steps

## Limitations & Bias

### Scope Limitations

- The archive documents **one creator and one evolving practice**
- **Does not** represent artists, materials, studios, or drawing practices broadly
- Single-creator longitudinal archive useful for within-practice change studies only

### Coverage & Metadata Completeness

- Current public video coverage begins in **2024, not 2012**
- Earlier 2012–2016 archive (8+ TB) is not yet published
- Standard and pre-standard tiers have **substantially different** historical descriptive/provenance completeness
- Acquisition conditions differ between tiers

### Technical Limitations

- Workspace can contain hands, tools, phones, tablets, reference material, and other objects that may create visual shortcuts or occlusion
- Stored resolution and frame rate **do not** establish physical or temporal calibration
- Large files make exhaustive inspection and replication expensive
- **No official leakage-safe split exists**

### Data Characteristics

- `encoded_frame_rate` is playback rate, not original temporal sampling
- Encoded time-lapse playback must **not** be treated as real drawing time
- Missing metadata values must **not** be interpreted as zero or false

## Dataset Intended Use Summary

### ✓ Recommended Uses

- Archival and drawing-process research
- Qualitative within-creator analysis
- Self-supervised video experiments
- Frame-change and workspace analysis
- Annotation and tracking method development

### ⚠ Requires Validation

- Hand or pen-tip tracking
- Optical-flow comparison
- Temporal behavior analysis
- Real-world measurement (trajectory, velocity, acceleration)

### ✗ Not Validated

- Population-level claims about artists
- Clinical or biometric inference
- Authorship or identity inference
- Benchmark training/evaluation splits
- Commercial use outside CC BY-NC 4.0

---

**Dataset URL**: https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts
