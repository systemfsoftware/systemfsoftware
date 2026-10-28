---
title: Cancel superseded pull-request runs without cancelling main, merge queue, or release
applies_when:
  - adding or changing a workflow's concurrency block or its triggers
  - a workflow with a pull_request trigger has no concurrency group
tags: [ci, concurrency, cancel, cost]
---

A workflow with a `pull_request` trigger declares a concurrency group keyed on the workflow and the pull request number or ref: `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`.

Set `cancel-in-progress` to true only for `pull_request` events that are not queue runs. Never cancel runs on main, queue runs (for example, `head_ref` starting with `mergify/merge-queue/`), or release runs. Cancelling a run on main drops its cache write or release output (each-suite-runs-in-its-lane.md).

Without cancellation, GitHub replaces only pending runs: "To also cancel any currently running job or workflow in the same concurrency group, specify cancel-in-progress: true." (https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs).

Decision test: For each workflow with a `pull_request` trigger added or modified in the diff, read its `concurrency` block. The diff fails when:

- The workflow has no `concurrency` block.
- The concurrency group omits the pull request number or ref.
- `cancel-in-progress` evaluates to true for a push to main, a release, or a queue run (for example, an unconditional `cancel-in-progress: true` when the workflow also triggers on push to main).

Defect prevented: Without cancellation, superseded PR runs waste runners on obsolete commits. With unconditional cancellation, a second push to main cancels the first push's cache write or release.

```yaml
# WRONG: a second push to main cancels the first push's cache write and release
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

```yaml
# RIGHT
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' && !startsWith(github.head_ref, 'mergify/merge-queue/') }}
```

Source: GitHub, "Control the concurrency of workflows and jobs", quoted above. Workflow lane rules: each-suite-runs-in-its-lane.md.

Gate: judge
