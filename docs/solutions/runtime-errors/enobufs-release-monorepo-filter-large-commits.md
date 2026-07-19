---
title: execFileSync ENOBUFS when analyzing large commits in release-monorepo-filter
date: 2026-07-19
category: runtime-errors
module: release-tooling
problem_type: runtime_error
component: tooling
symptoms:
  - "spawnSync git ENOBUFS crash in release-monorepo-filter.mjs"
  - semantic-release fails during analyzeCommits step with buffer overflow
root_cause: missing_tooling
resolution_type: code_fix
severity: medium
tags:
  - enobufs
  - semantic-release
  - exec-file-sync
  - buffer-overflow
  - repos
---

# execFileSync ENOBUFS when analyzing large commits in release-monorepo-filter

## Problem

The `release.yml` CI pipeline crashed during `pnpm release` with `spawnSync git ENOBUFS` in `scripts/release-monorepo-filter.mjs`. The error occurred in the `filesInCommit` function when running `git diff-tree --name-only -r -m` on the constitution subtree import commit (`25c2917e`), which touches thousands of files.

## Symptoms

- `[stryker-plugins] failed: spawnSync git ENOBUFS`
- `[tsconfig] failed: spawnSync git ENOBUFS`
- Stack trace pointing to `filesInCommit` at `release-monorepo-filter.mjs:9`
- Both failures reference the same commit hash — the constitution subtree import

## What Didn't Work

- Simply increasing `maxBuffer` from the default 1MB to 10MB would prevent the crash, but didn't address why vendored content was being analyzed at all.

## Solution

Two changes to `scripts/release-monorepo-filter.mjs`:

1. **Exclude `repos/` at the git level** (root cause fix). Added a pathspec filter to `git diff-tree`:
   ```js
   execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', hash, '--', '.', ':!repos'], ...)
   ```
   The `:!repos` pathspec tells git to exclude all paths under `repos/` from the diff output. This is the vendored, locked content directory that should never trigger package releases.

2. **JS-level guard** as a secondary filter:
   ```js
   .filter((f) => !f.startsWith('repos/'))
   ```
   Catches any `repos/` paths that might slip through.

3. **Increased maxBuffer** to 10MB as a safety net for any future large commits.

## Why This Works

`repos/constitution/` is vendored content (locked, read-only per AGENTS.md). The commit that imported this subtree touches thousands of files. The monorepo filter's `filesInCommit` runs `git diff-tree` for every commit since the last release tag to determine which packages each commit affects. The output from the constitution commit alone overflowed Node.js's default `execFileSync` buffer (1MB).

The fix has two layers:

- Root cause: vendored `repos/` content should never be analyzed for release decisions. The git-level pathspec exclusion prevents it from entering the buffer at all.
- Safety: increased `maxBuffer` ensures other edge cases don't crash the pipeline.

- When adding large vendored subtrees, ensure release tooling excludes them —
  now handled at the pathspec level (any future vendored content under `repos/`
  is automatically excluded)
- The `maxBuffer: 10 * 1024 * 1024` increase is a defense-in-depth measure, not a substitute for excluding vendored content

## Related

- `scripts/release-monorepo-filter.mjs` — the fixed file
- `docs/solutions/tooling-decisions/tsdown-manages-publishconfig-during-build.md` — earlier fix in the same CI pipeline
