---
title: Remove a catalog dependency in two installs
date: 2026-10-10
category: conventions
module: pnpm workspaces
problem_type: convention
component: tooling
severity: medium
applies_when:
  - removing a dependency whose specifier is `catalog:` and whose entry leaves the catalog in the same change
  - any change that edits the `catalog:` block of `pnpm-workspace.yaml` and regenerates `pnpm-lock.yaml`
symptoms:
  - "a frozen install fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH: the current \"catalogs\" configuration doesn't match the value found in the lockfile"
  - "a lockfile regenerated to remove one package also moves unrelated packages, such as effect 4.0.0 to 4.0.2"
resolution_type: workflow_improvement
retire_when: "pnpm stops re-resolving every catalog entry on a catalogs mismatch; check by repeating the one-step removal below on a newer pnpm and seeing only the removed package leave the lockfile"
tags:
  - pnpm
  - catalogs
  - lockfile
  - dependency-removal
---

# Remove a catalog dependency in two installs

## Context

Stead dropped `@systemfsoftware/gritlint` (systemfsoftware/Stead#469). The package was a root devDependency with the specifier `catalog:`, and its entry `"@systemfsoftware/gritlint": ^0.1.0` sat in the `catalog:` block of `pnpm-workspace.yaml`. Removing both lines and running one install produced a lockfile diff of 409 insertions and 825 deletions. Every catalog entry had been resolved again: the catalog pins `effect: "^4.0.0"`, the lockfile had held `effect` at 4.0.0, and the new lockfile moved it to 4.0.2 in 126 places. A change meant to delete one package had upgraded the runtime for the whole workspace, and nothing in the diff's file list said so.

## Guidance

Remove the dependency from every `package.json` first and run the install. Then remove the catalog line and run the install again.

```bash
# 1. drop the "catalog:" dependency from package.json, then
pnpm install --no-frozen-lockfile
# 2. drop the entry from the catalog: block of pnpm-workspace.yaml, then
pnpm install --no-frozen-lockfile
# a pure removal leaves no added lines in the lockfile
git diff -U0 pnpm-lock.yaml | grep -c '^+[^+]'   # expect 0
```

The first install deletes the package and drops its now-unused entry from the lockfile's own `catalogs:` block. The catalog line removed in the second step is then already absent from the lockfile, so the configuration matches and nothing is resolved again.

## Why This Matters

On the same tree, with the same pnpm and the same flags, the two orders give different lockfiles:

| Procedure                                  | `pnpm-lock.yaml` diff | `effect`                   |
| ------------------------------------------ | --------------------- | -------------------------- |
| both lines removed, one install            | +409 / -825           | 4.0.0 -> 4.0.2 (126 lines) |
| dependency, install, catalog line, install | -81, nothing added    | stays 4.0.0                |

Both lockfiles pass a later `pnpm install --frozen-lockfile`, so no gate tells them apart. The one-step lockfile carries a version bump that nobody asked for, inside a change described as a removal.

## When to Apply

- Removing any dependency that resolves through a catalog, in this repository or in a consumer.
- Any edit to the `catalog:` block that should not move other entries. If an install reports a catalogs mismatch, treat it as a sign that every range is about to be resolved again.

## Examples

Observed on pnpm 12.6.0 (Stead's `packageManager`) under `CI=true`, where a plain `pnpm install` is frozen and fails with the mismatch error before `--no-frozen-lockfile` is passed. Each procedure ran on a fresh worktree at Stead `8eff55ee` with `--ignore-scripts`. This repository pins pnpm 12.9.0, where the one-step behaviour has not been checked; run the `grep -c` check above after any catalog removal.

## Related

- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`: how this repository uses catalogs.
- `docs/solutions/build-errors/turbo-verdicts-under-stale-cache-and-strict-env.md`: a catalog flip as a cross-cutting change.
