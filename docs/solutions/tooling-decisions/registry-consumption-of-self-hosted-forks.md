---
title: consume the self-hosted arethetypeswrong CLI fork from npm, not the workspace
date: "2026-08-09"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Adding or editing any dependency on `@systemfsoftware/arethetypeswrong-cli`
  - Adding a devDependency from `packages/arethetypeswrong/cli` back onto one of its consumers
  - Evaluating whether another self-hosted fork package should be registry-consumed
root_cause: cyclic_workspace_dependency
resolution_type: registry_consumption
related_components:
  - pnpm-workspace.yaml (the `attw` catalog)
  - packages/arethetypeswrong/cli
  - packages/arethetypeswrong/core
  - packages/oxlint-plugins/effect-dmmf
tags:
  - arethetypeswrong
  - pnpm
  - catalogs
  - dependency-cycle
  - workspace
---

# Consume the self-hosted arethetypeswrong CLI fork from npm, not the workspace

## Context

Every package in this repo consumed `@systemfsoftware/arethetypeswrong-cli` through the `workspace:^` protocol — 36 consumers. The CLI is a self-hosted fork: it is developed in this monorepo AND published to npm. The in-flight rewrite of the CLI (the `attw-cli` worktree) adds devDependencies back onto two consumers — `@systemfsoftware/effect-gherkin-spec` and `@systemfsoftware/oxlint-plugin-effect-dmmf` — which would close workspace cycles the moment the rewrite merges.

The cycle class is the one recorded in `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`: package-level mutual devDependencies that turbo cannot topologically order. The new wrinkle is reachability: `effect-dmmf` is the umbrella lint plugin with workspace dependencies on ~20 sibling oxlint plugins, and those siblings all consumed the CLI from the workspace. So the rewrite's two devDependencies did not create two clean 2-cycles — measured from the lockfile's `link:` edges, they closed **one strongly-connected component of 25 packages** through the CLI (witness 3-cycle: `arethetypeswrong-cli → oxlint-plugin-effect-dmmf → oxlint-plugin-test-placement → arethetypeswrong-cli`).

## Root cause

Only the `workspace:` protocol links a workspace package into a consumer. A plain version range — including one reached through a catalog — resolves from the registry. With no `.npmrc`, `linkWorkspacePackages` defaults to false, so the entire cross-package graph was workspace-linked, and every one of those edges is a potential cycle participant once the target package starts dev-depending back on its consumers. The rewrite's devDependencies made the CLI such a target; the umbrella-plugin fan-out made the blast radius 25 packages, not 2.

## Solution

All 36 consumers now declare `"@systemfsoftware/arethetypeswrong-cli": "catalog:attw"` (registry range `^1.1.1` via the `attw` catalog in `pnpm-workspace.yaml`) instead of `workspace:^`. The CLI's own packages stay workspace-linked — `arethetypeswrong-cli` keeps its `workspace:*` runtime link to `arethetypeswrong-core` — and the rewrite's devDependencies on gherkin and dmmf remain workspace links. The workspace graph holds only one-way edges out of the CLI, so no devDependency the rewrite later adds can close a loop.

Verified with a Tarjan strongly-connected-component pass over the lockfile's `link:` edges, in both graph states (main, and with the rewrite's devDependencies applied): the only non-trivial SCC is the known `{oxlint-plugin-cell-taxonomy, stryker-js-mutation-run, stryker-js-typescript-checker}` triple owned by the path-resolved-base plan (`docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md`). The CLI appears in no non-trivial SCC, and zero workspace edges point into it.

## Guidance

- **The invariant is "no workspace edge into the CLI", not a direct-edge rule.** A rule like "a package the CLI devDepends on must not workspace-depend on the CLI" is insufficient: the CLI's devDependencies reach consumers transitively (dmmf reaches ~20 sibling plugins), so any consumer anywhere with a `workspace:` edge into the CLI is a potential loop-closer. New consumers must use `catalog:attw`; existing consumers must never be reverted to `workspace:^`.
- **The mechanism is the `workspace:` protocol, not catalogs.** A catalog is just a shared range: `catalog:attw` resolves from the registry only because the entry is a plain range and `linkWorkspacePackages` is unset. A future `.npmrc` enabling `linkWorkspacePackages` would re-link these edges and silently reintroduce the cycle class — the convention lives with the protocol choice, not the catalog.
- **Registry consumption costs staleness by design.** During the rewrite window, consumer `attw` runs validate against the published CLI (`^1.1.1`), not the working tree. The CLI's changes reach consumers only at its next publish, subject to the 24-hour `minimumReleaseAge` policy. That is the accepted trade: attw development decouples from attw consumers, and consumers no longer participate in attw's workspace graph.
- **The registry CLI pins its own core.** Published `arethetypeswrong-cli@1.1.1` depends on `arethetypeswrong-core@1.1.0` while the workspace core is 1.1.1. Consumers install the CLI's transitive core from the registry and never import `arethetypeswrong-core` directly, so the skew is inert.
- **The lockfile perturbation is expected.** Each switched consumer's attw entry changes from `link:` to a registry resolution, and the registry CLI brings its own transitive tree (chalk, commander, cli-table3, marked, marked-terminal, core@1.1.0).
- **Prevention is prose, not a gate.** No `scripts/` entry or `pnpm check` step enforces this (REPO-S6: enforcement for a published concern ships inside the published artifact). The enforcers that do exist: pnpm's cyclic-workspace warning and turbo's hard cycle failure inside `pnpm check` — the same enforcement the path-resolved-base plan relies on.

## Related

- `docs/plans/2026-08-09-001-refactor-registry-attw-consumption-plan.md` — the implementation plan (units U1–U7)
- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — the recorded cycle class
- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md` — the named-catalog convention
- `pnpm-workspace.yaml` — the `attw` catalog entry and `minimumReleaseAge`
- `docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` — the sibling plan that owns the remaining SCC
