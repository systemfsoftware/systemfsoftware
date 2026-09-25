---
title: Timed Mutation Jobs on Standard Runners - Plan
type: ci
date: 2026-09-25
topic: timed-mutation-jobs
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
supersedes: docs/plans/2026-09-25-0515-ci-timed-mutation-jobs-plan.md
execution: code
---

# Timed Mutation Jobs on Standard Runners - Plan

## Goal Capsule

- **Objective:** Mutation runs on free GitHub-hosted runners. Its jobs are packed from recorded durations, the same way the gate's test jobs are, with no target-discovery script. Every package gets one row in the merged report.
- **Means:** `scripts/tools/test-timings.ts --task mutation` plans the jobs. `scripts/tools/mutation-job.ts` runs a job and folds shard parts into one part per package. `shardMutate` selects each shard's files.
- **Product Authority:** The owner's requests in this session: drop Blacksmith; delete `scripts/tools/discover-mutation-targets.mjs`; shard mutation like the other CI lanes, with several packages per job; leave mutation out of turbo's cache, because Stryker's incremental mode already caches; run mutation on main only; open no PR with review findings unapplied; add no test files for this work.
- **Open Blockers:** None.

---

## Product Contract

### Problem Frame

`mutation.yml` ran one job per package on `blacksmith-8vcpu-ubuntu-2404`, and a 369-line lockfile-parsing script built the package list. In recent `main` runs, 11 of the 14 targets hit the 30-minute cap; run 36077182124 is one example.

### Requirements

- R1. No workflow names a Blacksmith runner label.
- R2. `scripts/tools/discover-mutation-targets.mjs` is deleted, and nothing references it.
- R3. A plan job reads main's newest `mutation-timings` record. It packs every package that has a `mutation` script into the fewest `ubuntu-latest` jobs whose predicted load fits 15 minutes. A package with no record is predicted at the full 15 minutes.
- R4. A package predicted over the target splits into ceil(seconds / target) shards. Each file the package's `mutate` patterns match is mutated by exactly one shard. When `STRYKER_SHARD` is unset, `mutate` stays as written.
- R5. A job runs its packages one at a time. Each package is capped at twice the target and at whatever is left of a job budget of four times the target, which keeps the job under its runner timeout. Its duration and exit code are recorded as soon as it finishes. A capped run records a lower bound, so the next plan splits that package further. A package the budget no longer covers is skipped. A job keeps going after a failed package and fails at the end when any package produced no report. A score below threshold alone never fails it.
- R6. The report has one part per package. Its shard reports fold into one report, and two shards that mutated the same file make the fold fail. A planned package with no part still gets a row.
- R7. Stryker's incremental files carry over between runs through one shared cache. A shard's file is `stryker-incremental-<k>of<n>.json`. Turbo does not cache mutation.
- R8. The test lane keeps its current behavior.

### Key Decisions

- **Drop Blacksmith for mutation.** (session-settled: user-directed — chosen over keeping Blacksmith for mutation-class work.) Governs R1.
- **Delete the discovery script.** (session-settled: user-directed — chosen over lockfile-derived discovery with changed-path scoping.) Governs R2.
- **Pack mutation by recorded time, like the test lane.** (session-settled: user-directed — chosen over a fixed 16-shard matrix in which every shard ran every package.) Governs R3, R5.
- **No turbo cache for mutation.** (session-settled: user-directed — chosen over turbo inputs and outputs on the `mutation` task; Stryker's incremental mode already caches.) Governs R7.

---

## Implementation Plan

### Key Technical Decisions

- **KTD1. One planner.** `test-timings.ts` gains `--task` (which package script and which turbo task) and `--unknown-seconds`, and its jobs carry `dirs`. The balancing and the rule for merging shard durations stay shared with the test lane.
- **KTD2. Shards by file, and Stryker keeps its own matcher.** `sliceFiles` deals the sorted files round-robin, starting from a rotation hashed from the package name. `shardMutate` returns the original patterns followed by a negation of every file that another shard owns. A file that this expansion misses but Stryker matches is therefore mutated by every shard instead of none, and the fold rejects the overlap. Line-range slicing is rejected: Stryker only mutates a node that sits entirely inside a range, so mutants spanning a slice boundary would be lost. Mutant-level sharding would need a `--shard` flag in `@systemfsoftware/stryker-js`, which lives in another repository. As a result, a single-file package (`effect-atom`) cannot be split, and its extra shards dry-run for nothing.
- **KTD3. The job logic lives in `mutation-job.ts`, not in workflow shell.** The workflow steps only call it. It has no test file (owner-directed); it is verified by the smoke below.
- **KTD4. The fold, not per-shard labels, feeds `merge-reports`.** Shards partition a package's files, so the union of their `files` is the package report. `PACKAGES` comes from the plan, so a package with no part shows as a row with no report.

### Implementation Units

#### U1. `parseShard`, `sliceFiles`, and `shardMutate` in `@systemfsoftware/stryker-config`, adopted by all 14 `stryker.config.ts`

Verification: a throwaway run that loads the real `stryker.config.ts` of `effect-daemon-spec` (21 files), `oxlint-plugin-test-discipline` (33) and `effect-atom` (1) under `STRYKER_SHARD=k/4` for each k puts every file in exactly one shard, and `5/4` is refused.

#### U2. Remove `hex-schema`'s stale `mutation` scripts and Stryker devDependencies

Its config was deleted in #265.

#### U3. Planner `--task`, `mutation-job.ts`, and `mutation.yml` as plan → jobs → timings + report

Verification: `mutation-job.ts run` with a stubbed `corepack` across one group job (one package crashes) and four shard jobs. The group job exits 1 after running every package, a budget of 0 skips all four packages, and `combine` folds the four shard reports into one part per package. `actionlint` passes.

#### U4. Docs

`.github/AGENTS.md`, plus the mutation-budgets and ci-gate `docs/solutions` entries. The discovery script is deleted.

### Risks

- The first run on main has no record, so every target gets its own job and the heavy ones hit the 30-minute cap. The next plan shards them from those lower bounds.
- `stryker merge-reports` could not be run locally, because the local-mutation guard refuses any `pnpm … stryker` call. The fold writes the part format that `merge-reports` decodes (`mutation-part.json`, `mutation-report.json`, `mutation-stream.jsonl`).
