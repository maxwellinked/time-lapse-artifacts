# Audit follow-up - November 1, 2026

This dated reconciliation supplements, rather than rewrites, the October 27
implementation/reproducibility review. It closes only the old finding's relevance
to current photograph-selection operations; it does not certify the whole archive.

## Original finding retained

The October 27 review reported that `tools/build-reference-lookup.py` rejected a
preserved photograph attached to superseded work `tlaw-b03bbfba8babbf3d`, whose
active successor is `tlaw-858a03eb138fbf47`. Its inspected revisions were HF
`c75826cbc1e1366d05b0deb0746c880c34f3d750` and GitHub
`fc6e60510bdd1f9873afccaf9a4a53adb3c28433`.

The original `technical-audit-2026-10-27.md` remains unchanged among the retained
review artifacts; it was not present in the inspected GitHub tree and is not
republished here. Its SHA-256 is
`21c5ed190511ca058245d93eeb703aec6cc34cf806cda2e7d28ac83c2cfc4491`.
The accompanying October 27 structured results are also unchanged.

## Subsequent implementation and checked evidence

[PR #68](https://github.com/maxwellinked/time-lapse-artifacts/pull/68), merged on
October 30 as `996b00008ffc9bc502da8f0f8163fc38ee588b5d`, moved current browser
photograph choices to the authoritative Hugging Face selection registry.
Historical lookup, candidate and correction evidence retains its original scope.

For this follow-up, the inspected GitHub baseline is
`eff6d66b8e2d89158e0b06c00934fd3d7b23f2ea`. Its
[reference policy](https://github.com/maxwellinked/time-lapse-artifacts/blob/eff6d66b8e2d89158e0b06c00934fd3d7b23f2ea/REFERENCE_POLICY.md)
identifies the registry as current selection authority, and its
[projection manifest](https://github.com/maxwellinked/time-lapse-artifacts/blob/eff6d66b8e2d89158e0b06c00934fd3d7b23f2ea/data/photo-selection-projection.json)
binds that registry to HF revision
`44ac0117e9240f2c3f2877d8739abdc159b8370f` and exact input/output identities.
These are this follow-up's reviewed pins, not promises about future `main`.

GitHub reports the baseline's
[pinned-reproduction job](https://github.com/maxwellinked/time-lapse-artifacts/actions/runs/41284923979/job/124784188314)
successful on November 1, including both the photograph-projection/retained-image
step and the pinned-migration/historical-evidence step. This note records retrieved
CI results and source inspection, not a newly executed local reproduction run.
The policy also records inclusion of the five previously missing paired-view
fronts; fresh hosted image delivery was not repeated for this note.

## Disposition and remaining limits

**Superseded for current operations, not repaired:** the old lookup failure is
closed as a blocker for the current registry-driven photograph-selection workflow.
The legacy builder's
[active-work-only guard](https://github.com/maxwellinked/time-lapse-artifacts/blob/eff6d66b8e2d89158e0b06c00934fd3d7b23f2ea/tools/build-reference-lookup.py#L181-L184)
remains unchanged. It is a retained compatibility limitation, not proof of failure
in the newer exporter. Historical reproduction must use the documented historical
inputs and stages; do not relax guards, delete evidence or transfer confirmations
to make a different input population pass.

The current pinned-input checks address the earlier integration-check gap within
their declared scope. They do not reconstruct private historical selection inputs,
re-encode all display JPEGs, establish whole-media fixity or restoreability, or
resolve the October 27 Windows-specific test failures. Those limits are not closed
by this reconciliation. A reproduced failure in the supported current workflow
would require a separately scoped finding.

This documentation-only change alters no source code, canonical metadata,
photograph choices or relationships, media bytes, historical receipts, or evidence
qualifications. Hugging Face remains authoritative; historical evidence is retained
without being promoted to current selection authority.
