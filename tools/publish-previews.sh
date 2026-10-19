#!/usr/bin/env bash
set -euo pipefail

# Called only after generation and strict validation in generate-previews.yml.
[[ "${GITHUB_REF:?}" == refs/heads/main ]] || { echo "Preview publication must start from main." >&2; exit 1; }
[[ "${GITHUB_RUN_ID:?}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:?}" =~ ^[0-9]+$ ]] || exit 1
git diff --cached --quiet || { echo "Refusing unrelated staged changes." >&2; exit 1; }
git add -- previews assets/record-anchors
if git diff --cached --quiet; then
  echo "Dynamic preview pack is already complete."
  exit 0
fi

# Persist provenance only for changed MP4s, never for cache-only runs.
mapfile -d '' generated_previews < <(git diff --cached --name-only --diff-filter=AM -z -- 'previews/*.mp4')
if (( ${#generated_previews[@]} )); then
  mkdir -p previews/provenance
  provenance="previews/provenance/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.txt"
  cp "$RUNNER_TEMP/preview-toolchain.txt" "$provenance"
  {
    printf '\nSHA-256 of resulting manifest:\n'
    sha256sum previews/manifest.json
    printf '\nSHA-256 of added or modified previews from this run:\n'
    sha256sum -- "${generated_previews[@]}"
  } >> "$provenance"
  git add -- "$provenance"
fi

# A unique branch avoids overwriting another run or a maintainer's review edits.
# Never push, force-update, or auto-merge main; its required checks stay in force.
branch="automation/recording-previews-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
git switch -c "$branch"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "Update generated recording previews"
git push origin "HEAD:refs/heads/$branch"
body="$RUNNER_TEMP/preview-pr.md"
cat > "$body" <<EOF
Generated recording previews and their corresponding images from $(git rev-parse HEAD^).

Generation and strict preview validation passed before this commit. Unchanged verified images retain their original bytes and encoder provenance. Review any changed media and the committed processing receipts before merging.

Run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID

The Validate site workflow is explicitly dispatched on this branch to run the required validate check, including strict preview validation. Merge through the normal protected-branch process after that check succeeds.
EOF
gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$branch" \
  --title "Update generated recording previews" --body-file "$body"
# GITHUB_TOKEN-created PRs do not run CI unattended; workflow_dispatch does.
gh workflow run validate-site.yml --repo "$GITHUB_REPOSITORY" --ref "$branch"
