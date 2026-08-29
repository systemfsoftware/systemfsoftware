---
title: one vitest instance per test chain, or snapshot state forks
date: "2026-08-29"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - A workspace package declares `@effect/vitest` (or any vitest plugin that imports vitest internals) while the workspace resolves more than one vitest build
  - Snapshot matchers throw "SnapshotClient.setup()" errors that most cases in the same file do not reproduce
  - pnpm install output or `pnpm why vitest` shows two vitest paths differing only in peer-suffix hash
root_cause: dependency_duplicate
resolution_type: config_change
related_components:
  - the pnpm lockfile importer graph
  - the vitest peer-dependency closure
  - packages/testing/specs/gherkin/effect
  - packages/testing/type-testing/arethetypeswrong/analysis
tags:
  - pnpm
  - vitest
  - snapshot
  - effect
  - flaky-tests
  - duplicate-instances
---

# One vitest instance per test chain, or snapshot state forks

## Context

The `@systemfsoftware/arethetypeswrong` analysis suite records outcomes as file snapshots through vitest's native matchers. On CI it threw "The snapshot state … is not found. Did you call 'SnapshotClient.setup()'?" — deterministically for one recipe, with run-to-run variance across the others, while most scenarios in the same file passed. `SnapshotClient.setup()` demonstrably ran: vitest's own runner calls it before the file's tests.

## Failure mechanism

1. pnpm keys a package build by name + version + resolved peer context. The `@effect/vitest` packages entry pulls vitest under one peer closure; the analysis package's own vitest dev-dependency resolves under a different one. The deeper driver was an esbuild split: storybook's csf-plugin context resolved esbuild `0.27.7` while tsx used `0.28.2`, and the difference propagated through vite's peer chain into vitest. Two physical installs result: same version `4.1.10`, different `.pnpm` suffix hash.
2. vitest plugins import vitest internals (`@vitest/snapshot`, `@vitest/runner`) through their own instance. Two vitest copies mean two `@vitest/snapshot` module instances, each with its own `SnapshotClient` class and its own snapshot-state map.
3. The runner registers per-file state in the map belonging to the copy it loaded. A matcher invoked through the other copy's `getSnapshotState` consults a map that never saw the file — the state-loss throw.
4. Effect's runtime context (`Effect.runtime` retrieval, daemon forks) makes module-instance resolution order-dependent per scenario: a recipe whose continuation hops the async boundary between setup and assertion deterministically hits the wrong map; recipes that stay on the runner's stack hit the right one until worker scheduling shuffles it. Hence one deterministic failure plus distributed flake, in one file, with no code-level cause.

Repair is deduplicating the peer driver — `pnpm dedupe` when the contexts are accidental, a single-version override in the workspace settings (the esbuild case) when a transitive peer genuinely forks them: one physical vitest, one module registry, state keyed once.

## Architectural invariants

- **Single-instance invariant:** for every workspace importer whose link closure reaches `@effect/vitest` — as a declarer or as a consumer that links one — the vitest copy `@effect/vitest` loads and the vitest copy the importer runs must realpath to the same file. A consumer without its own `@effect/vitest` inherits the edge of the nearest declarer in its link reach. Equality is per-importer and per-physical-path; version-string equality proves nothing.
- **The invariant lives in the install, not the tests.** No test-level workaround can reunify two module registries. Repair where the fork is created: deduplicate the peer driver (`pnpm dedupe` when the peer contexts are accidental, a single-version override in the workspace settings when a transitive peer genuinely forks them).
- **Detecting relapse without a standing gate:** `pnpm why vitest` listing two physical paths (same version, different `.pnpm` suffix) is the fork, already present. `pnpm dedupe --check` fails when overlapping ranges resolve to separate builds — run it when snapshot-state errors appear, not as a standing chain member; the guard class that re-derives pnpm's resolution by hand was rejected in review as cargo cult.

## Verification

The repair was verified on the failure itself: with the forked lockfile, the snapshot suite failed deterministically for one recipe and flaked across the others; after the override collapsed the peer driver to one esbuild minor, the same native-snapshot suite passed 16/16 on three consecutive runs. When the smell resurfaces, confirm the fork with `pnpm why vitest` before touching the test.

## Code smells

- Snapshot-state errors that migrate between scenarios across runs while most cases pass: suspect duplicate runtime instances before suspecting the test.
- An error message demanding a setup call that the runner verifiably made: the caller and the checker are bound to different module copies.
- Two `.pnpm` entries for one package differing only in peer-suffix hash: every stateful singleton inside it is forked per instance.

## Boundaries

Never patch `SnapshotClient` internals or vitest dist from this repo. Detection of the multi-instance condition inside vitest itself is an upstream question — ask before filing it there.
