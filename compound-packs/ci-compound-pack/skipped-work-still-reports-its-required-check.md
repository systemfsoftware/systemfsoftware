---
title: A workflow skips work its change cannot affect, and a required check still reports on every pull request and merge-queue draft
applies_when:
  - adding paths, paths-ignore or branches filters to a workflow trigger
  - adding an if condition that skips a job or step based on changed files
  - making a check required, or changing which checks the merge queue requires (Mergify merge_conditions or the branch ruleset)
tags: [ci, paths, required-checks, merge-queue, skip]
---

- A job may skip when the change touches none of the check's inputs. "If at least one path matches a pattern in the paths filter, the workflow runs." (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Skipping has a cost: the authors of the ICSE 2021 evaluation "recommend test-selection to incentivize skipping full builds to save higher cost in CI", and found that "all our studied techniques were affected by that trade-off" of higher cost savings bringing more missed build failures, and that "a seemingly-safe technique [2] still missed a high ratio of failures" (https://arxiv.org/abs/2102.06666, sec. VI-D; the ICSE page carries only the abstract).
- The skip list names every input that can change the result: the source, the check's config, the lockfile and the workflow file itself.
- A required check never skips through `on: paths`, `on: branches` or a `[skip ci]` commit message. GitHub: a workflow "skipped due to branch filtering, path filtering, or a commit message" leaves its checks "in a \"Pending\" state. A pull request that requires those checks to be successful will be blocked from merging." (https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions). A required check skips only through a step-level `if:` inside its own job, computed from a `git diff --name-only` step in that job. It never skips through a producer job and `needs:` (ci-workflows, pull-request-jobs-check-after-a-frozen-install.md), and never through a third-party paths-filter action.
- A check named in Mergify's merge_conditions runs on the queue draft PR, a pull_request whose head_ref starts with mergify/merge-queue/, and the PR-lane condition never skips it there. A repo with no Mergify and a GitHub merge queue triggers the check on merge_group, or "The merge will fail as the required status check will not be reported." (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Which suites run in which lane is set by ci-workflows, each-suite-runs-in-its-lane.md.

The findings are: a `paths`, `paths-ignore` or `branches` filter on the `on:` of a workflow whose job is a required check; a skip list that leaves out the workflow file, the lockfile or the check's config; a skip implemented as a job-level `if:` behind `needs:`; and a merge_conditions check that is skipped or never triggered on mergify/merge-queue/* drafts.

Consequence: a required check left Pending blocks every merge that skips it, which is a P1 under action-class-rubric.md (a breaking contract hit in normal use). An incomplete skip list lets a defect merge unchecked (P1). A missing skip wastes runners (P2).

Gate: judge
