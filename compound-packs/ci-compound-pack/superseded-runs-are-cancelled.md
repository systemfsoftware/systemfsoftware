---
title: A pull-request workflow cancels its own superseded in-progress run, and runs on main, merge-queue drafts and release are never cancelled
applies_when:
  - adding or changing a workflow's concurrency block or its triggers
  - a pull-request workflow has no concurrency group
tags: [ci, concurrency, cancel, cost]
---

A workflow with a pull_request trigger declares a concurrency group keyed on the workflow and the pull request number or ref (for example `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`). It sets `cancel-in-progress` true only for pull_request events that are not queue runs. With Mergify, a queue run is a pull_request event whose head_ref starts with `mergify/merge-queue/`.

Why: a new push makes the older run's verdict worthless, but without cancel-in-progress GitHub replaces only the pending run. "To also cancel any currently running job or workflow in the same concurrency group, specify cancel-in-progress: true." (https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs).

Runs on main are excluded because a push to main runs the cache write and the release (ci-workflows, each-suite-runs-in-its-lane.md), and cancelling one would drop that output. This exclusion is derived from that rule, not quoted.

Example of what this forbids: a workflow triggered on push to main and on pull requests that sets `group: ci-${{ github.ref }}` with an unconditional `cancel-in-progress: true`. A second push to main cancels the first push's cache write or release.

Consequence: superseded runs keep spot runners busy, and agents push often. Under action-class-rubric.md this is a performance regression (P2). Cancelling a release run is P1.

Gate: judge
