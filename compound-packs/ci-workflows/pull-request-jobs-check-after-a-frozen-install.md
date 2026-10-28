---
title: Pull-request jobs run only checkout, tool fetch, cache restore, and frozen install; lint and typecheck share one job
applies_when:
  - adding or changing the steps or needs: of a job a pull request runs
  - adding a dev shell, a tool build or a producer job to a pull-request job
  - splitting lint and typecheck into separate jobs or matrix legs
  - adding a commit-message, changeset or pull-request-title check
tags: [ci, setup, dev-shell, pull-request, jobs]
---

A verdict step produces a check outcome: lint, typecheck, a test, or a guard.

Before its first verdict step, a pull-request job runs only checkout, one pinned tool fetch, a cache restore, and a frozen install. It never enters a dev shell (`nix develop`, a dev-shell action, or a wrapped command), builds a tool from source, bootstraps the workspace, or declares `needs:`.

Lint and typecheck share one job with one checkout and install. A commit-message check runs as a step in this shared job. A changeset or pull-request-title check runs its fetched tool in its own job without a workspace install, dev shell, or `needs:`.

Decision test: for each pull-request job added or changed in the diff, inspect its `needs:` and the steps before its first verdict step. Fail the diff if:

- Any pre-verdict step is not checkout, one pinned tool fetch, a cache restore, or a frozen install (or if a changeset or pull-request-title check runs an install).
- The job enters a dev shell, builds a tool from source, or bootstraps the workspace.
- The job declares `needs:`.
- Lint and typecheck run in separate jobs or matrix legs.
- A commit-message check runs in its own job.

Defect prevented: a pull request waits on setup before receiving the fastest available verdict. Entering a dev shell can take minutes before a typecheck that runs for seconds. Separate jobs duplicate checkout and install time, and runner minutes are billed rounded up to the nearest whole minute.

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
    - run: actions/setup-node@<sha>
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
