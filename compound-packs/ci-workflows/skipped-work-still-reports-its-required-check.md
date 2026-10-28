---
title: A required check reports on every pull request and merge-queue run even when work is skipped
applies_when:
  - adding paths, paths-ignore or branches filters to a workflow trigger
  - adding an if condition that skips a job or step based on changed files
  - making a check required, or changing which checks the merge queue requires (queue-tool merge conditions or the branch ruleset)
tags: [ci, paths, required-checks, merge-queue, skip]
---

Never filter workflow triggers with `paths`, `paths-ignore`, or `branches` when the workflow runs a required check. GitHub states that a workflow "skipped due to branch filtering, path filtering, or a commit message" leaves its checks "in a \"Pending\" state. A pull request that requires those checks to be successful will be blocked from merging." (https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions).

To skip work safely, run the required job on every pull request and skip individual steps using a step-level `if:`. Determine changed files inside the job with `git diff --name-only`. Do not skip through an upstream producer job and `needs:`, and do not use third-party paths-filter actions.

The skip list must include every file that can affect the result: the source code, the tool's configuration, the lockfile, and the workflow file itself. GitHub defines path filtering: "If at least one path matches a pattern in the paths filter, the workflow runs." (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). In an ICSE 2021 evaluation, researchers "recommend test-selection to incentivize skipping full builds to save higher cost in CI", but found that "all our studied techniques were affected by that trade-off" and "a seemingly-safe technique [2] still missed a high ratio of failures" (https://arxiv.org/abs/2102.06666, sec. VI-D).

Required checks must also report on merge-queue runs without skipping. For GitHub merge queues, include the `merge_group` trigger; otherwise, "The merge will fail as the required status check will not be reported." (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). For queue tools that open draft pull requests, run on `pull_request` when `head_ref` matches the queue branch prefix (such as `mergify/merge-queue/`).

Decision test: Review workflow triggers, job conditions, and required-check lists in the diff. The diff fails if:

- A workflow running a required check filters `on:` with `paths`, `paths-ignore`, or `branches`.
- A skip condition omits the workflow file, the lockfile, or the check's configuration.
- A required check skips through an upstream job and `needs:`, or through a third-party paths-filter action.
- A check required by a merge queue omits `merge_group` (or the tool's queue branch prefix), or skips during a queue run.

Defect prevented: A skipped required check stays in "Pending" and blocks merging. An incomplete skip list lets broken code merge untested. Missing skips waste runner capacity.

```yaml
# WRONG: a required check behind a path filter reports nothing on a docs-only change
on:
  pull_request:
    paths: ["src/**"]
jobs:
  typecheck:
    steps:
      - run: pnpm typecheck
```

```yaml
# RIGHT: the job always starts and skips its own step
jobs:
  typecheck:
    steps:
      - uses: actions/checkout@<sha>
        with:
          fetch-depth: 0
      - id: changed
        run: |
          if git diff --name-only "origin/${{ github.base_ref }}...HEAD" | grep -qE '^(src/|pnpm-lock.yaml|tsconfig|\.github/workflows/ci.yml)'; then echo run=true >> "$GITHUB_OUTPUT"; fi
      - if: steps.changed.outputs.run == 'true'
        run: pnpm typecheck
```

Source: GitHub, "Triggering a workflow", "Workflow syntax" and "Managing a merge queue", quoted above. The ICSE 2021 evaluation of test selection in CI (https://arxiv.org/abs/2102.06666), quoted above.

Gate: judge
