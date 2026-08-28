---
title: A root workspace protocol edge hashes every turbo task
date: "2026-08-28"
category: tooling-decisions
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Adding a workspace protocol developmentDependency at the monorepo root
  - A turbo task cache-misses on packages that did not change
  - "hashOfInternalDependencies is non-empty on an unrelated package dry-run"
root_cause: cyclic_workspace_dependency
resolution_type: registry_consumption
related_components:
  - turbo
  - pnpm catalogs
tags:
  - turbo
  - hashOfInternalDependencies
  - workspace-protocol
  - catalog
---

# A root workspace protocol edge hashes every turbo task

## Problem

Turbo folds the workspace-root internal dependency set into `hashOfInternalDependencies`. A `workspace:` edge at the root therefore sits in every task hash. Editing a mutation-tooling package then cache-misses lint and test on packages that do not consume it.

## Symptoms

- CI `cache miss, executing` on ~90 tasks after a one-package source edit
- `turbo run lint --filter=<unrelated>` dry-json shows a non-empty `hashOfInternalDependencies`
- Reproducing the miss locally requires the CI env (`GITHUB_ACTIONS`, `OXLINT_FORMAT`, `CI`) because those are task `env` keys, not because the hash itself is env-dependent

## What Didn't Work

- Per-task `inputs` exclusions: they hide the miss; they do not remove the global component
- Leaving the six mutation packages as root `workspace:^` and hoping consumers already declared them: the global component stayed non-empty
- Declaring those packages as `peerDependencies` on the plugins: turbo still walks some peer graphs; the user rejected peers. Forward `workspace:^` from oxlint plugins back to the CLI closed a package-graph SCC (`plugin → cli → all → plugin`)

## Solution

1. Empty the root of every `workspace:` specifier. Consumers that run `stryker` declare the CLI and plugin set as their own developmentDependencies.
2. Packages that `all` production-depends on must not `workspace:`-depend the CLI. They take published versions through a named catalog (`catalog:stryker`), the same mechanism as `catalog:attw`. See docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md.
3. Packages outside that production fan-in (`daemon-spec`, `hex-schema`, omp plugins) keep `workspace:^` so they still mutate against the in-tree fork.
4. Own-org registry pins skip the 24h `minimumReleaseAge` cutoff via `minimumReleaseAgeExclude: ["@systemfsoftware/*"]`. Third-party exclusions stay refused.

## Why This Works

**Invariant.** A task hash may include package P only if that task's package depends on P, or P is a declared task input. A root `workspace:` edge is a dependency of every package for hashing purposes. Removing it makes `hashOfInternalDependencies` the empty string.

**Cycle class.** `workspace:` is the only protocol that links a workspace package into a consumer. A plain catalog range resolves from the registry. One-way edges cannot SCC.

**Staleness.** Registry consumers validate against the last published fork, not the working tree. That is the accepted cost; in-tree consumers remain on `workspace:^`.

## Prevention

- Probe: CI-env `turbo run lint --filter=<unrelated> --dry=json` → `hashOfInternalDependencies === ""` and the task hash unchanged under a synthetic edit in a former root workspace package.
- Probe: declaring consumer's `mutation` hash _does_ move under that edit.
- Gate: pnpm cyclic-workspace warning and turbo `Cyclic dependency detected` (task graph). Package-graph warnings dump the SCC; they are not a hard fail.
- Do not reintroduce root `workspace:^` for any package whose sources change on ordinary PRs.

## Related

- docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md
- docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md
- GitHub issue 285
