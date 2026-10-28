---
title: A pull-request workflow cancels its own superseded in-progress run, and runs on main, merge-queue runs and release are never cancelled
applies_when:
  - adding or changing a workflow's concurrency block or its triggers
  - a workflow with a pull_request trigger has no concurrency group
tags: [ci, concurrency, cancel, cost]
---

A workflow with a `pull_request` trigger declares a concurrency group keyed on the workflow and the pull request number or ref, for example `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`. It sets `cancel-in-progress` true only for `pull_request` events that are not queue runs. Where a queue tool opens a draft pull request per batch, a queue run is a `pull_request` event whose `head_ref` starts with the queue tool's branch prefix (for example `mergify/merge-queue/`).

A new push makes the older run's verdict worthless, but without `cancel-in-progress` GitHub replaces only the pending run: "To also cancel any currently running job or workflow in the same concurrency group, specify cancel-in-progress: true." (https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs).

Runs on main, queue runs and release runs are never cancelled. A push to main writes the cache and releases (each-suite-runs-in-its-lane.md), and cancelling one drops that output. This exclusion is derived from that rule, not quoted.

Decision test: for each workflow with a `pull_request` trigger that the diff adds or changes, read its `concurrency` block. The diff fails when the workflow has none, when its group does not include the pull request number or ref, or when `cancel-in-progress` is true for a push to main, a release or a queue run (an unconditional `true` on a workflow that also triggers on push to main or on queue runs).

Defect prevented: without cancellation, superseded runs keep runners busy on verdicts nobody reads, and frequent pushes multiply them. With unconditional cancellation, a second push to main cancels the first push's cache write or release.

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

Source: GitHub, "Control the concurrency of workflows and jobs", quoted above. Which events run which work is each-suite-runs-in-its-lane.md.

Gate: judge
