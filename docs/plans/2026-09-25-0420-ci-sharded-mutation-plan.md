---
title: Sharded Mutation on Standard Runners - Plan
type: ci
date: 2026-09-25
topic: sharded-mutation
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Sharded Mutation on Standard Runners - Plan

## Goal Capsule

- **Objective:** The Mutation workflow runs on free GitHub-hosted runners, splits the work across a fixed number of shards, and needs no target-discovery script.
- **Means:** A fixed `shard` matrix on `ubuntu-latest`; each shard runs `turbo mutation` over every package, and each package's Stryker config mutates only its slice of files, chosen by `STRYKER_SHARD=<index>/<count>`.
- **Product Authority:** The owner's request in this session: drop Blacksmith, delete `scripts/tools/discover-mutation-targets.mjs`, run mutation sharded in CI.
- **Open Blockers:** None.

---

## Product Contract

### Summary

Mutation runs on `ubuntu-latest` in 16 shards per push to `main` (and on `workflow_dispatch`). Turbo decides which packages are mutation targets: every package with a `mutation` script. Each shard mutates a disjoint slice of every target's files, and the report job merges all parts.

### Problem Frame

`.github/workflows/mutation.yml` runs one job per package on `blacksmith-8vcpu-ubuntu-2404`, fed by `scripts/tools/discover-mutation-targets.mjs` (369 lines: lockfile `importers` parsing, a nesting assertion, changed-path scoping, a selftest). Blacksmith bills every vCPU-minute; on this public repository standard runners are free. Even on 8 vCPUs, 11 of 14 targets hit the 30-minute cap in recent `main` runs (for example run 36077182124: `effect-daemon-cluster`, `effect-daemon-spec`, `effect-readiness`, and `oxlint-plugin-test-discipline` were all cancelled at 30 minutes). Those targets never produce a report, and the same run found no incremental cache to restore for `effect-daemon-cluster`.

### Requirements

- R1. No workflow names a Blacksmith runner label.
- R2. `scripts/tools/discover-mutation-targets.mjs` is deleted, and nothing references it.
- R3. Mutation runs as a fixed matrix of shards. The set of targets is whatever `turbo mutation` runs; no step lists packages.
- R4. The shards partition every target's files: each file lands in exactly one shard, so no mutant is lost or run twice.
- R5. Unset `STRYKER_SHARD` leaves a package's `mutate` unchanged, so local `pnpm mutation` behaves as before.
- R6. A malformed `STRYKER_SHARD` fails the run with an error that names the value.
- R7. The advisory contract holds: a score below threshold never fails a shard, but a target that produced no report fails its shard red.
- R8. Each shard keeps its own incremental cache.

### Key Decisions

- **Drop Blacksmith for mutation.** (session-settled: user-directed — chosen over keeping Blacksmith reserved for mutation-class work, the position in `docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md`.) Governs R1.
- **Delete the discovery script.** (session-settled: user-directed — chosen over keeping lockfile-derived discovery with changed-path scoping.) Governs R2.
- **Shard mutation in CI.** (session-settled: user-directed — chosen over one job per package.) Governs R3.

---

## Implementation Plan

### Key Technical Decisions

- **KTD1. Fixed shard matrix; turbo enumerates targets.** Every shard runs `turbo mutation --continue --concurrency=1` over the whole workspace. Rejected: a package × shard matrix fed by a one-line discovery step. It keeps a discovery step and builds the workspace in 14×N jobs, where N shard jobs do the same mutant work with N builds. `--concurrency=1` because each Stryker run already uses every CPU (`concurrency: '100%'` on CI in `packages/toolchain/stryker-config/lib/base.js`).
- **KTD2. File-level slicing in `@systemfsoftware/stryker-config`.** New export `shardMutate(patterns)`: when `STRYKER_SHARD=k/N` is set, it expands the package's `mutate` globs with `node:fs` `globSync` (negated patterns become `exclude`), sorts the files, and keeps every file whose index mod N is k-1. Rejected: mutation line ranges (`file.ts:a-b`). Stryker only mutates nodes fully inside a range (`isInsideMutateRanges` in `@systemfsoftware/stryker-js`), so a node that spans a slice boundary would be dropped from every shard. Also rejected: mutant-level sharding, which needs a `--shard` feature in `@systemfsoftware/stryker-js` (repository `systemfsoftware/stryker-js-effect`). That is a separate change in another repository.
- **KTD3. Round-robin over the sorted list, not a hash.** Round-robin gives balanced slices. When a file is added, later files move to other shards, and their mutants miss the incremental cache once. That costs one re-run, not a wrong result.
- **KTD4. An empty slice becomes `mutate: []`.** Stryker's `mutate` default applies only when the key is absent (`defaulted(...)` in the Stryker options schema), so `[]` means no files to mutate. A target with fewer files than N gets empty slices in some shards. Those shards still run the dry run for that package, which wastes time but loses nothing.
- **KTD5. 16 shards, 60-minute job budget.** In recent runs 11 targets were cancelled at 30 minutes on 8 vCPUs, so a full run needs at least ~660 runner-minutes on 4 vCPUs. Over 16 shards that is about 41 minutes per shard plus builds and dry runs. Later runs reuse the incremental cache.
- **KTD6. One merge-reports part per (package, shard), labelled `<package>#<k>`.** `stryker merge-reports` refuses duplicate labels, and the shards partition files, so each part is a complete report for its slice. Each part is staged as a flat directory holding `mutation-part.json`, `mutation-report.json`, and `mutation-stream.jsonl`, the names `merge-reports` reads. Before this change, the uploaded `reports/mutation/mutation.json` was never read as a report, because `merge-reports` looks for `mutation-report.json`. Every part fell back to the stream and was marked incomplete.
- **KTD7. Remove `hex-schema`'s stale mutation wiring.** Its Stryker config was deleted in #265, but the `mutation` scripts and the Stryker devDependencies stayed. Turbo would run a Stryker with no config there.

### Implementation Units

#### U1. `shardMutate` in `@systemfsoftware/stryker-config` and its adoption

- **Files:** `packages/toolchain/stryker-config/lib/base.js`, `packages/toolchain/stryker-config/lib/base.d.ts`, and every `packages/**/stryker.config.ts` (14 files).
- **Approach:** Export `shardMutate(patterns: readonly string[]): string[]` beside `sharedConfig`. Each config wraps its `mutate` array. A mutation-range pattern is rejected with an error, because it would expand to nothing.
- **Test scenarios:** (throwaway smoke, per the repo's verification rules) for a real package and N in {1, 3, 16}: the union of all slices equals the expansion with `STRYKER_SHARD` unset, the slices are pairwise disjoint, unset returns the input unchanged, and `STRYKER_SHARD=0/4`, `5/4`, and `x` throw with the value in the message.
- **Verification:** the smoke output; `pnpm check:local`.

#### U2. Remove `hex-schema`'s stale mutation wiring

- **Files:** `packages/schema/hex-schema/package.json`, `pnpm-lock.yaml`.
- **Verification:** `turbo mutation --dry=json` lists exactly the 14 packages that own a `stryker.config.ts`.

#### U3. Rewrite `.github/workflows/mutation.yml`

- **Approach:** Delete the `discover` job. The `mutation` job uses matrix `shard: [1..16]` on `ubuntu-latest`, has a 60-minute timeout, and sets `STRYKER_SHARD`. Its cache path is `packages/**/reports/stryker-incremental.json`, keyed per shard. Per-package require and summary steps loop over the packages that own a `stryker.config.ts`. Parts are staged per KTD6. The `report` job merges without `--packages`: the shard jobs already fail red on a missing report. Add `STRYKER_SHARD` to the `mutation` task's `env` in `turbo.json`, because strict env mode would otherwise strip it.
- **Verification:** `workflow_dispatch` of Mutation on the PR branch. It passes when every shard job produces reports and the report job merges them.

#### U4. Delete the discovery script and correct the docs

- **Files:** `scripts/tools/discover-mutation-targets.mjs` (deleted), `.github/AGENTS.md`, `docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md`, `docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md`.
- **Approach:** Historical plans and postmortems that cite the script as it was stay unchanged.

### Scope Boundaries

- No change to `@systemfsoftware/stryker-js` and no mutant-level sharding (KTD2).
- No changed-path scoping. Every run mutates every target, and the incremental cache makes the untouched mutants cheap.

### Assumptions

- Stryker handles `mutate: []` by running with zero mutants and writing a report with no files. The branch dispatch in U3 verifies this.
- Free-plan concurrency (20 standard jobs) absorbs 16 shards; mutation runs only on `main` pushes and dispatch.

### Risks

- Every shard dry-runs every target. With 16 shards and 14 targets that is 224 dry runs per full run. The heavy daemon suites dominate the shards' fixed cost, and KTD5's budget absorbs it. Skipping the dry run needs a Stryker feature (see KTD2).
- Empty slices (KTD4) produce zero-mutant parts. If Stryker writes no report for zero mutants, the require step turns those shards red. The branch dispatch in U3 checks this before merge.
- The test-layer gate admits no permanent test here: the change is CI wiring plus a config helper without a test harness, so U1 is proven by a throwaway smoke.

### Sources

- `node_modules/@systemfsoftware/stryker-js/dist/main.mjs`: `merge-reports.cell.ts` (part file names, duplicate-label refusal), mutation-range containment, the `mutate` default.
- stryker-js issue #2707 (https://github.com/stryker-mutator/stryker-js/issues/2707): upstream practice splits the `mutate` files across CI containers, dry-runs in each container, and merges the JSON reports afterwards.
- GitHub Actions job timings for `mutation.yml` runs from 2026-09-23 to 2026-09-25.
