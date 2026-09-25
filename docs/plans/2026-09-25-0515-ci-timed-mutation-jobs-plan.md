---
title: Timed Mutation Jobs on Standard Runners - Plan
type: ci
date: 2026-09-25
topic: timed-mutation-jobs
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
supersedes: docs/plans/2026-09-25-0420-ci-sharded-mutation-plan.md
execution: code
---

# Timed Mutation Jobs on Standard Runners - Plan

## Goal Capsule

- **Objective:** Mutation runs on free GitHub-hosted runners. The jobs are packed from recorded durations, the same way the gate's test jobs are, and no target-discovery script is involved.
- **Means:** `scripts/tools/test-timings.ts` gains `--task mutation`. The Mutation workflow gets plan, jobs, timings, and report stages. A package over the target is split into shards with `STRYKER_SHARD`.
- **Product Authority:** The owner's requests in this session: drop Blacksmith; delete `scripts/tools/discover-mutation-targets.mjs`; shard mutation the way the other CI lanes are sharded, with several packages per job; leave mutation uncached by turbo, because Stryker's incremental mode already covers it; mutation runs only on main.
- **Open Blockers:** None.

---

## Product Contract

### Problem Frame

`mutation.yml` ran one job per package on `blacksmith-8vcpu-ubuntu-2404`. The package list came from a 369-line lockfile-parsing script. In recent `main` runs, 11 of the 14 targets hit the 30-minute cap (run 36077182124 is one example). A fixed 16-shard matrix, the first attempt on this branch, was rejected by the owner because the gate already packs its work by measured time.

### Requirements

- R1. No workflow names a Blacksmith runner label.
- R2. `scripts/tools/discover-mutation-targets.mjs` is deleted and nothing references it.
- R3. A plan job packs every package that has a `mutation` script into the fewest `ubuntu-latest` jobs whose predicted load fits the target (15 minutes). The prediction comes from main's newest `mutation-timings` record. A package with no record is predicted at the full target.
- R4. A package predicted over the target splits into ceil(seconds / target) shards. The shards partition its files, so no file is lost or mutated twice. With `STRYKER_SHARD` unset, `mutate` is unchanged.
- R5. Each job runs its packages one at a time. Each package is capped at twice the target, and its measured seconds and exit code are recorded. A capped run records a lower bound, so the next plan splits that package further.
- R6. Advisory contract: a score below threshold never fails a job, but a package that produced no report fails its job red.
- R7. Stryker's incremental files carry over between runs through one shared cache. A shard's file is named `stryker-incremental-<k>of<n>.json`. Turbo does not cache mutation.
- R8. The test lane keeps its current behavior.

### Key Decisions

- **Drop Blacksmith for mutation.** (session-settled: user-directed — chosen over keeping Blacksmith for mutation-class work.) Governs R1.
- **Delete the discovery script.** (session-settled: user-directed — chosen over lockfile-derived discovery with changed-path scoping.) Governs R2.
- **Pack mutation by recorded time, like the gate's test lane.** (session-settled: user-directed — chosen over a fixed 16-shard matrix where every shard ran every package.) Governs R3, R5.
- **No turbo cache for mutation.** (session-settled: user-directed — chosen over turbo inputs and outputs for the `mutation` task, because Stryker's incremental mode already covers it.) Governs R7.

---

## Implementation Plan

### Key Technical Decisions

- **KTD1. Reuse `test-timings.ts`.** Add `--task <script>`, which selects packages by that script and the turbo task by that name, and `--unknown-seconds`. Jobs gain a `dirs` field. A repeated `part` call on the same `--out` appends, so a job that runs several packages writes one part. The planner, the balancing, and the shard-merge rule stay shared with the test lane. Rejected: a second planner.
- **KTD2. File-level shards through `shardMutate`.** The files are sorted, rotated by a hash of the package name, and dealt round-robin. Line-range slicing is rejected: Stryker mutates only nodes that sit entirely inside a range, so mutants spanning a slice boundary would be lost. Mutant-level sharding would need a `--shard` flag in `@systemfsoftware/stryker-js`, which lives in another repository. A single-file package (`effect-atom`) cannot be split; its extra shards dry-run for nothing.
- **KTD3. Jobs call `pnpm --filter <pkg> mutation` directly** under `timeout`, with `--incrementalFile` chosen per shard. Turbo is used only to build the job's packages.
- **KTD4. Merge parts are labelled `<dir>` for a whole package and `<dir> (k/n)` for a shard.** They are staged under the file names `stryker merge-reports` reads (`mutation-report.json`). A slice with zero files contributes no part.

### Implementation Units

#### U1. `shardMutate` in `@systemfsoftware/stryker-config`, adopted by all 14 `stryker.config.ts`

Verification: a throwaway smoke loads each real config with the package as cwd. For N = 1, 3, and 16, the slices are disjoint and their union equals the git-tracked files matched by the unsharded patterns. Malformed `STRYKER_SHARD` values and mutation-range patterns are rejected.

#### U2. Remove `hex-schema`'s stale `mutation` scripts and Stryker devDependencies

Its config was deleted in #265.

#### U3. `test-timings.ts --task`, and `mutation.yml` rewritten as plan → mutation → timings + report

Verification: the planner with no record gives 14 one-package jobs. A fake record gives one 3000 s package split into 4 shards and four small packages packed into one job. The Mutation step script, run with a stubbed `corepack`, runs a group's packages in turn, keeps going after a failed package, fails the job at the end, and writes one part with every duration. Its shard label and incremental file name are correct, and it skips a zero-file report. `merge` keeps a package's previous duration when not all of its shards reported. `actionlint` passes; `pnpm test:scripts` passes.

#### U4. Docs

`.github/AGENTS.md`, the `docs/solutions` mutation-budgets entry, and the ci-gate entry. Delete the discovery script.

### Risks

- The first run on main has no record. Every target gets its own job, and the heavy ones hit the 30-minute cap. The next plan shards them from the lower bound.
- The sharded workflow cannot be dispatched from this session's token (HTTP 403), so the first real run happens on main after merge.
