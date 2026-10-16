---
title: CI Wall Clock in the Shared Reusables - Plan
type: ci
date: 2026-10-16
supersedes: docs/plans/2026-10-12-1519-ci-ci-wall-clock-plan.md
topic: ci-wall-clock
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# CI Wall Clock in the Shared Reusables - Plan

## Goal Capsule

- **Objective:** Every repository that calls systemfsoftware's reusable workflows gets one 60-minute stuck-job backstop instead of per-job kill switches, measured wall time on a pull request without a changed conclusion, and a main branch where every merge gets its own postsubmit verdict, by bumping one pin.
- **Means:** Changes land in the shared reusables (`reusable-checks`, `reusable-nix`, `reusable-commitlint`), their shared actions and Deno tools, and systemfsoftware's own callers, in PR #743 (`ci/ci-discipline`).
- **Product authority:** Root's CI-discipline brief (as amended through 2026-10-12, recorded in the superseded plan) and PR #743's review ruling, which cut two concerns from this PR as separable: the red-main verdict route and the pinned commitlint toolchain. That ruling governs the cut; the superseded plan keeps the full contract for both follow-ups.
- **Rule citations** (the ci-wall-clock ids the root froze): D1 and R4-R7 `one-stuck-job-backstop`; R5 `pr-gate-runs-only-what-the-diff-affects`; D8 (R11-R12) `heavy-suites-judge-every-main-commit`; D6 (R20) `no-lane-grades-the-repos-own-docs`. D3 `light-checks-run-the-pinned-tool` and D4 `red-main-reverts-its-culprit-same-day` are deferred with their requirements, not implemented here.
- **Open blockers:** none.

## Requirements

**One stuck-job backstop (D1).**

- R1. Every job and step under `.github/` sets `timeout-minutes` to 60 or to its reusable's `backstop-minutes` (default 60). `reusable-checks`, `reusable-nix` and `reusable-commitlint` expose one `backstop-minutes` input each; it replaces `timeout-minutes`, `plan-timeout-minutes`, `gate-timeout-minutes` and the lane JSON's `"timeout-minutes"` key, which are removed (`reusable-mutation`'s is its own PR's).
  - Verification: `git grep -nE 'timeout-minutes' -- .github` names only `backstop-minutes` rows and `reusable-mutation.yml`'s own inputs.
- R2. No cap moves elsewhere: no `timeout` command, no lowered input, no skip flag.
  - Verification: `git grep -nE "\btimeout( +[0-9-]|['\"])|--kill-after" -- .github scripts` matches nothing.
- R3. The backstop is uniform; nothing above 60.

**Measured wall time (R4-R7, R5).**

- R4. Every job of `reusable-checks`, `reusable-nix` and `reusable-commitlint` writes its own wall time to its step summary through `$/.github/actions/job-record` (start stamp, finish record uploaded as one artifact).
- R5. The call's `wall-clock` job (in checks and nix) or the commitlint job's last step tabulates the records and warns, without changing any job's conclusion, when a pull-request job runs over 10 minutes, the call over 10 minutes from first start to last end, or a docs-only job over 3 minutes.
  - Verification: `deno test scripts/tools/wall-clock.test.ts` exits 0; actionlint on the workflows exits 0.
- R6/R7. Measurement adds no caller permission: `nix.yml` and `commitlint.yml` grant `contents: read` only; records travel as same-run artifacts.

**Per-run postsubmit (D8).**

- R11. `ci.yml`, `nix.yml`, `consumer-fixture.yml` and `storybook-gherkin-browser.yml` group concurrency per ref on a pull request (cancel in progress) and per run id on every other event, so no push, merge-queue or dispatch run is cancelled or replaced. `release.yml` is unchanged.
  - Verification: `git grep -nE 'group: .*github\.ref' -- .github/workflows` lists only `release.yml` and expressions pairing `github.ref` with `github.run_id` (same check as `docs/solutions/integration-issues/per-ref-concurrency-drops-main-verdicts.md`).
- R12. A shared `cancel-in-progress: false` group is not an alternative: GitHub keeps one pending run per group and cancels the older pending one.

**No lane grades the repo's own docs (D6).**

- R20. The `single-plan` subcommand leaves CI and the gates: `ci.yml`'s docs lane runs only dprint, `gate:repo` and `.husky/pre-push` no longer run it, and the `checks-lane` docs phase drops its single-plan fetch. REPO-D2 becomes a `review` gate at the plan gate.

## Unit Map

Landed as PR #743's commits (after merging `origin/main`):

1. `ci(actions): record job wall time and split hook failures by reason` — `job-record` action; `failure-summary` writes the reason for `job-record`.
2. `build(tools): add the wall-clock and red-main deno tools` — as cut, only `wall-clock` and its test remain.
3. `ci(workflows): one 60-minute backstop, measured wall time` — the reusable and caller changes above.
4. `chore(repo): make REPO-D2 a plan-gate convention` — the `single-plan` removal.
5. `docs(plans)`: this plan, superseding the 2026-10-12 one; the CI runbook states the new reusable contract; the solution records why per-ref concurrency dropped main's verdicts.

## Deferred contract (follow-up PRs, detail in the superseded plan)

- **Red-main verdict route (D4, R13-R18, R36, AE20).** The `red-main` action, tool and test are cut from this PR: the design contradicts `compound-packs/ci-wall-clock/red-main-reverts-its-culprit-same-day.md` and needs an owner ruling. The pack rule may flag this PR's main runs; that is recorded, not fixed, here.
- **Pinned commitlint toolchain (D3, R8-R10, R31-R32).** The `scripts/commitlint/` workspace, its lockfile and the `commitlint` action are cut; `reusable-commitlint` keeps main's consumer install.

## Verification

- `deno test scripts/tools/wall-clock.test.ts` exits 0.
- actionlint on `.github/workflows` and `.github/actions` exits 0.
- The grep checks in R1, R2 and R11 exit 0.
- The PR diff contains no `red-main` and no `scripts/commitlint`.
