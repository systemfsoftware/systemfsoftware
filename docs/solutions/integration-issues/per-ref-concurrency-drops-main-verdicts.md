---
title: Per-ref concurrency drops main's verdicts
category: integration-issues
module: ci
date: 2026-10-12
problem_type: integration_issue
component: ci
severity: high
symptoms:
  - "a merge to main cancels the previous merge's still-running CI, Nix or Mutation run, and that commit never gets a verdict"
  - "runner minutes are spent on main runs that end `cancelled`"
root_cause: config_error
resolution_type: config_change
related_components:
  - development_workflow
tags:
  - github-actions
  - concurrency
  - postsubmit
  - ci-wall-clock
---

# Per-ref concurrency drops main's verdicts

## Problem

`ci.yml`, `nix.yml`, `mutation.yml` and `consumer-fixture.yml` grouped concurrency by `github.ref` with `cancel-in-progress: true`. Every push to main shares `refs/heads/main`, so each merge cancelled the run of the merge before it. From 2026-10-04 to 2026-10-11 (74 merges; jobs API, `filter=latest`), this cancelled 24 of 55 Mutation runs, 4 CI runs and 1 Nix run on main. The cancelled Mutation runs had already used 7,779 runner-minutes, and their commits never got a verdict (`docs/plans/2026-10-11-0531-ci-ci-wall-clock-plan.md`, Problem Frame).

## Why `cancel-in-progress: false` alone does not fix it

A group keeps at most one pending run. GitHub's workflow syntax reference, `concurrency`: "By default, any existing `pending` job or workflow in the same concurrency group will be canceled". With a shared main group and `cancel-in-progress: false`, three quick merges still lose the middle one: it is pending when the third arrives and is cancelled.

## Solution

Group per ref only on a pull request, where a new push really does replace the old head, and per run everywhere else:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Each push, merge-queue and dispatch run then has a group of its own and is never cancelled or replaced. `release.yml` keeps its per-ref group with `cancel-in-progress: false`: a release publishes main's newest state, so a dropped pending release loses no verdict.

## Check

`git grep -nE 'group: .*github\.ref' -- .github/workflows` lists only `release.yml` and expressions that pair `github.ref` with `github.run_id`. A workflow whose main runs carry a verdict and whose group is the bare ref is this bug. `mutation.yml` still has it until the mutation lane's own change (the plan's PR-B) gives it the same expression.
