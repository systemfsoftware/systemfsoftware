---
title: A pull-request job runs only checkout, one pinned tool fetch, a cache restore and a frozen install before its checks, and lint and typecheck share one job
applies_when:
  - adding or changing the steps or needs: of a job a pull request runs
  - adding a dev shell, a tool build or a producer job to a pull-request job
  - splitting lint and typecheck into separate jobs or matrix legs
  - adding a commit-message, changeset or pull-request-title check
tags: [ci, setup, dev-shell, pull-request, jobs]
---

Before its first verdict step, a job a pull request runs performs only checkout, one pinned tool fetch, a cache restore and a frozen install. It never enters a dev shell (`nix develop`, a dev-shell action, a command wrapped in one), builds a tool from source, bootstraps the workspace, or waits on a producer job through `needs:`. A commit-message, changeset or pull-request-title check also skips the workspace install: it runs its fetched tool on the text.

Code lint and typecheck run in one job with one checkout and one install, never a job or matrix leg each.

A verdict step is a step whose outcome is a check's result: lint, typecheck, a test, a guard.

Decision test: for each job a pull request runs that the diff adds or changes, read the steps above its first verdict step and the job's `needs:`. The diff fails when any of them is something other than checkout, one pinned tool fetch, a cache restore and a frozen install (a text-only check: no install), when the job `needs:` another job, or when lint and typecheck land in two jobs or two matrix legs that each repeat checkout and install.

Defect prevented: a pull request waits on setup before the fastest answer it can get. Entering a dev shell can take minutes before a typecheck that runs for seconds. Each extra job repeats checkout and install, and each is billed separately, rounded up to the whole minute.

```yaml
# WRONG: a producer job, a dev shell, and a job each for lint and typecheck
lint:
  needs: build-tools
  steps:
    - uses: actions/checkout@<sha>
    - run: nix develop --command pnpm lint
typecheck:
  needs: build-tools
  steps:
    - uses: actions/checkout@<sha>
    - run: nix develop --command pnpm typecheck
```

```yaml
# RIGHT
lint-typecheck:
  steps:
    - uses: actions/checkout@<sha>
    - uses: actions/setup-node@<sha>
      with:
        node-version: 24.11.0
    - uses: actions/cache/restore@<sha>
      with:
        path: ~/.local/share/pnpm/store
        key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
    - run: pnpm install --frozen-lockfile
    - run: pnpm lint
    - run: pnpm typecheck
```

Source: GitHub, "Actions runner pricing": "GitHub rounds the minutes and partial minutes each job uses up to the nearest whole minute" (https://docs.github.com/en/billing/reference/actions-runner-pricing). Martin Fowler, "Continuous Integration" (2024): "Nothing sucks the blood of Continuous Integration more than a build that takes a long time" (https://martinfowler.com/articles/continuousIntegration.html). The list of allowed setup steps is this pack's ruling.

Gate: judge
