---
title: A verdict step never hides its failure, and a failing job names its reason and a reproduce command
applies_when:
  - adding or changing a step that runs a check
  - adding a job or changing what a failing job reports
tags: [ci, failures, continue-on-error, reproduce]
---

- A verdict step never carries continue-on-error: true, || true, or an if: that lets its failure pass, and no step is renamed advisory to escape this.
- Independent checks are separate named steps or tasks, never joined with &&; && joins only a producer to the consumer that reads its output.
- A failing job writes one reason code from the shared failure-summary action's closed set and a reproduce command, also when the job is cancelled or times out; a log link is never the reproduce command.
- A reproduce command runs from the workspace root, and a mutation job's reproduce command is a workflow_dispatch of its lane on main, never a local Stryker run.
- Whether a step is a verdict step is decided by the review judge; an uncertain case escalates.

```WRONG
- run: pnpm format:check && pnpm lint
  continue-on-error: true
```

```RIGHT
- name: format
  run: pnpm format:check
- name: lint
  run: pnpm lint
```

Gate: judge
