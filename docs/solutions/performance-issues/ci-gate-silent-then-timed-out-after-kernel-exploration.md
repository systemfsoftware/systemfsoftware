---
title: The CI gate went silent and then hit its timeout once every Gherkin case ran under kernel exploration
date: "2026-09-24"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "The `the gate (pnpm check:ci)` step grew from about 7.5 minutes to 39-44 minutes and was killed at the 45-minute job timeout"
  - "The gate log printed only turbo's task-started lines, then nothing for about 22 minutes, then the summary"
  - "The gate step's history jumped at one PR (#510); every run before it was under 8 minutes"
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - turbo.json
  - package.json
  - .github/workflows/reusable-checks.yml
  - scripts/tools/test-timings.ts
  - packages/effect-sim-kernel
  - packages/effect-spec-runtime
tags:
  - ci
  - turbo
  - vitest-shard
  - github-actions
  - conformance
  - timeout
---

# The CI gate went silent and then hit its timeout once every Gherkin case ran under kernel exploration

## Problem

After #510 the single gate job (lint, lint:tsgo, typecheck, test, test:types, attw, and build on one 4-vCPU `ubuntu-latest` runner) went from about 7.5 minutes to past its 45-minute timeout, and while it ran the log showed nothing.

## Root cause

Two independent causes combined, one making the gate slow and the other making it silent.

**Slow.** #510 routed every non-live Gherkin, trace, and differential case through `KernelCase.explore`. That runs the baseline and then replays the case once per seeded schedule. The seed count comes from the conformance profile: the kernel's `perChangeSeeds` is a flat 250, the `per-change` profile uses it regardless of the case's surveyed fiber count, and an unset `CONFORMANCE_PROFILE` resolves to `per-change`. `pnpm check:local` sets `local` (`localSeeds`, 25), so the same suite ran about 10 times more work in CI than on a developer machine. Measured at the CI profile on an 8-core machine at turbo concurrency 4, `test` took 400 s, and three packages accounted for most of it: `effect-daemon-spec` 328 s, `effect-atom` 222 s, `effect-memfs` 192 s. On a shared 4-vCPU runner that is also doing lint and typecheck, the step crossed 45 minutes.

**Silent.** The `test` task in turbo.json sets `"outputLogs": "errors-only"`, so a passing test task prints nothing. Under GitHub Actions turbo's default `--log-order=auto` picks grouped order, which holds a task's output until the task finishes. With both in place, the #519 log had no lines at all from 20:42:31 to 21:04:54. The turbo 2.11.2 binary reads `TURBO_LOG_ORDER`, but there is no environment variable for output logs, so streaming has to be requested with flags.

## Solution

- Test work is packed by measured duration. `test-timings.ts plan` reads the newest `test-timings-<profile>` artifact (`test-timings-local` for a pull request, `test-timings-per-change` for the merge queue, main, and the release gate) from `main` (from any branch when `main` has none), picks the fewest free `ubuntu-latest` jobs whose loads fit 5 minutes, and assigns packages longest first to the least-loaded job. A package predicted over 5 minutes becomes vitest shards (`--shard=i/n --reporter=blob`), and a `merge` job per sharded package runs `vitest --merge-reports`, which judges conformance coverage and v8 coverage once over all shards. Every run writes the durations it measured, so later runs re-pack from them.
- Each group job builds at full concurrency and then runs its packages' tests one at a time. Vitest already uses every core within a package, and running packages concurrently inside a job made each recorded duration depend on its neighbours. The first routed run, which had no record and ran packages concurrently, measured `effect-daemon-spec` at 1048 s while packed alongside `effect-memfs`. First-fit packing of equal default estimates had filled jobs alphabetically, giving jobs from 57 s to over 17 minutes.
- Static checks (`pnpm check:static`) run in their own job, separate from tests. `pnpm check:ci` still runs both.
- CI invokes turbo with `--output-logs=new-only --log-order=stream`. turbo.json keeps `errors-only`, so local runs and agent runs stay quiet.
- Blacksmith stays reserved for mutation-style workloads. On a public repository standard GitHub-hosted runners are free, so sharding across them costs nothing, while Blacksmith bills every vCPU-minute.

## Gotchas found on the way

- **Turbo passes `--` arguments to every task in the run, builds included.** `turbo run test -- --shard=1/2` delivered `--shard=1/2` to each upstream `build` task as well (seen in `turbo run test --dry=json`). Shards build through turbo first and then call the package's `test` script directly with the shard flags (the checks workflow's "Build for shard" and "Test shard" steps).
- **The conformance reporter used to accept an incomplete merge.** `vitest --merge-reports` with one shard's blob missing logged "not judged, 4 of 8 test files did not run" and exited 0. A merged run stands for the whole package, so the `conformanceCoverage` reporter in `@systemfsoftware/vitest-config` now fails it. A single shard still reports that it will be judged when the shards merge.

## Prevention

- When a change multiplies per-case work, such as a new seed budget, a new exploration mode, or a wall-clock timeout removed, measure `test` at the CI profile (`env -u CONFORMANCE_PROFILE CI=true pnpm exec turbo run test --summarize`) before merging. `check:local` runs the `local` profile and cannot show it.
- When a slow gate needs diagnosing, read the per-task `execution` times in `.turbo/runs/*.json` before touching runners. The CI log cannot show per-task durations while test output is grouped and errors-only.
