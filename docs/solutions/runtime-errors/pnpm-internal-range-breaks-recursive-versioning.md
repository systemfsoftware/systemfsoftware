---
title: ERR_PNPM_VERSIONING_INTERNAL_RANGE from a bare range on an internal workspace dependency
date: 2026-08-11
category: docs/solutions/runtime-errors
module: pnpm-workspace
problem_type: runtime_error
component: tooling
symptoms:
  - "ERR_PNPM_VERSIONING_INTERNAL_RANGE from `pnpm version -r` (and `--dry-run`), naming the offending package"
  - "Release Phase 1 (`pnpm version -r`) fails, so no Release PR opens"
root_cause: config_error
resolution_type: config_change
severity: medium
tags: [pnpm, workspace, versioning, changesets, release, peer-dependencies]
---

# ERR_PNPM_VERSIONING_INTERNAL_RANGE from a bare range on an internal workspace dependency

## Problem

`pnpm version -r` (recursive workspace versioning — the engine behind the
changeset/release flow) aborts with `ERR_PNPM_VERSIONING_INTERNAL_RANGE` when a
workspace package references another workspace package by a bare version range
(`"*"`) instead of the `workspace:` protocol. The release pipeline cannot
compute or propagate version bumps until every internal dependency uses
`workspace:`.

## Symptoms

- `corepack pnpm version -r --dry-run` exits non-zero with
  `ERR_PNPM_VERSIONING_INTERNAL_RANGE`, naming the offending package and its
  internal dependency.
- Phase 1 of the Release workflow (`.github/workflows/release.yml`, which runs
  `pnpm version -r` on every push to `main`) fails, so no Release PR opens.

## What Didn't Work

- Declaring the internal peer dependency as `"*"` — a habit carried over from
  external dependencies. pnpm's recursive versioning rejects a bare range for a
  package it can see is in the workspace; `"*"` does not declare the edge as a
  workspace link, so versioning refuses rather than guess.

## Solution

Change the internal dependency's range to the `workspace:` protocol. In
`packages/effect-schema-vite/package.json`, the
`@systemfsoftware/effect-schema-law` peerDependency was `"*"` and is now:

```json
"peerDependencies": {
  "@systemfsoftware/effect-schema-law": "workspace:*",
  "effect": "catalog:",
  "vite": ">5.0.0",
  "vitest": "*"
}
```

(`effect` and `vitest` stay as bare ranges — they are external packages. Only
the internal `@systemfsoftware/*` package needs `workspace:`.)

Verified this session: after the change,
`corepack pnpm version -r --dry-run` -> `EXIT=0`, and a seeded patch intent on
`@systemfsoftware/effect-schema-law` produced a correct release plan with
dependent propagation (`effect-schema-law` 0.6.1 -> 0.6.2 propagated
`effect-schema-vite` 1.5.1 -> 1.5.2).

## Why This Works

`pnpm version -r` walks the workspace graph to compute and propagate version
bumps across packages. For an internal (same-workspace) package it needs the
`workspace:` protocol to recognise the edge as a workspace link and rewrite its
range when the depended-on package is bumped. A bare range like `"*"` is
ambiguous — pnpm cannot confirm it refers to the workspace package, so recursive
versioning aborts with `ERR_PNPM_VERSIONING_INTERNAL_RANGE` rather than
silently mistreating an internal edge as external. The `workspace:` protocol
makes the internal edge explicit and versionable; pnpm rewrites it to a concrete
range at publish time.

## Prevention

- **Preflight with the dry-run.** Run `corepack pnpm version -r --dry-run`
  before relying on the release flow (and after any manifest change that adds an
  internal dependency). It surfaces internal-range violations and prints the full
  release plan without mutating anything.
- **Internal deps use `workspace:`.** Any `@systemfsoftware/*` dependency — in
  `dependencies`, `devDependencies`, `peerDependencies`, or
  `optionalDependencies` — must use the `workspace:` protocol
  (`workspace:*`, `workspace:^`), never a bare range. External dependencies keep
  their normal ranges or `catalog:`.
- **Repo-wide sweep.** Flag any internal dep declared as a bare range:
  `grep -rnE '"@systemfsoftware/[^"]+": "\*"' packages/` (a hit is a latent
  `ERR_PNPM_VERSIONING_INTERNAL_RANGE`).

## Related Issues

- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — a related `workspace:`-protocol concern (consumers declaring `catalog:` vs `workspace:^`); different problem (publishing/consumption topology, not recursive versioning).
- `.github/workflows/release.yml` — the Release workflow whose Phase 1 runs `pnpm version -r`.
