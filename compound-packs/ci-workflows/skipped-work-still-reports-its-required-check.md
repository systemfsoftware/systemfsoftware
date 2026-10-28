---
title: A workflow skips work its change cannot affect, and a required check still reports on every pull request and merge-queue run
applies_when:
  - adding paths, paths-ignore or branches filters to a workflow trigger
  - adding an if condition that skips a job or step based on changed files
  - making a check required, or changing which checks the merge queue requires (queue-tool merge conditions or the branch ruleset)
tags: [ci, paths, required-checks, merge-queue, skip]
---

A job may skip when the change touches none of the check's inputs: "If at least one path matches a pattern in the paths filter, the workflow runs." (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Skipping has a cost. The authors of the ICSE 2021 evaluation "recommend test-selection to incentivize skipping full builds to save higher cost in CI", found that "all our studied techniques were affected by that trade-off" of higher cost savings bringing more missed build failures, and that "a seemingly-safe technique [2] still missed a high ratio of failures" (https://arxiv.org/abs/2102.06666, sec. VI-D). So the skip list names every input that can change the result: the source, the check's config, the lockfile and the workflow file itself.

A required check never skips through `on: paths`, `on: branches` or a `[skip ci]` commit message. GitHub: a workflow "skipped due to branch filtering, path filtering, or a commit message" leaves its checks "in a \"Pending\" state. A pull request that requires those checks to be successful will be blocked from merging." (https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions). A required check skips only through a step-level `if:` inside its own job, computed from a `git diff --name-only` step in that job. It never skips through a producer job and `needs:` (pull-request-jobs-check-after-a-frozen-install.md), and never through a third-party paths-filter action.

A check named in the queue's required conditions runs on the queue run and the pull-request condition never skips it there. With a queue tool that opens a draft pull request, the queue run is a `pull_request` whose `head_ref` starts with the tool's prefix (such as `mergify/merge-queue/`). With a GitHub merge queue, the check triggers on `merge_group`, or "The merge will fail as the required status check will not be reported." (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Which suites run in which lane is each-suite-runs-in-its-lane.md.

Decision test: for each workflow trigger, job `if:` and required-check list the diff adds or changes, read the filters and the conditions. The diff fails on a `paths`, `paths-ignore` or `branches` filter on the `on:` of a workflow whose job is a required check; on a skip list that leaves out the workflow file, the lockfile or the check's config; on a skip implemented as a job-level `if:` behind `needs:`; and on a required-condition check that is skipped or never triggered on queue runs.

Defect prevented: a required check left Pending blocks every merge that skips it. An incomplete skip list lets a defect merge unchecked. A missing skip wastes runners.

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
