---
title: Every job carries the one 60-minute timeout, and nothing kills work sooner
applies_when:
  - adding a job or setting a job's or a step's timeout-minutes
  - wrapping a command in a wall-clock limit, or passing a tool a time cap
  - calling a reusable workflow, or passing a timeout or time cap through with:
tags: [ci, timeout, backstop]
---

Every job with `runs-on` sets `timeout-minutes: 60` as a literal, never another value and never an input or expression.

No step `timeout-minutes`, command wrapper (`timeout 600 …`), tool flag or tool setting kills work below 60 minutes of wall clock. A per-test timeout inside a test framework is not a wall-clock kill of the job and is out of scope.

A job that calls a reusable workflow passes no timeout or time cap through `with:`, at the top level or inside a structured input; the called workflow's jobs carry the backstop themselves.

Decision test: for each job, step, wrapper, tool invocation and `with:` block the diff adds or changes, read every timeout and time cap. The diff fails when a job with `runs-on` has no `timeout-minutes`, has a value other than the literal 60, or takes it from an input, or when anything else sets a wall-clock kill below 60 minutes or passes one to a called workflow.

Defect prevented: a job with no timeout holds a stuck runner for six hours. A cap below the job's real run time kills work that was progressing: the minutes already spent are lost, the commit gets no verdict, and the real cause hides behind "exceeded the maximum execution time". When jobs carry many different values, a timeout no longer tells a reader whether the job was stuck or slow; one value means a timeout always says "stuck".

```yaml
# WRONG
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - run: timeout 300 pnpm test
  heavy:
    uses: ./.github/workflows/reusable-tests.yml
    with:
      timeout-minutes: 30
```

```yaml
# RIGHT
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 60
    steps:
      - run: pnpm test
  heavy:
    uses: ./.github/workflows/reusable-tests.yml # its own jobs set timeout-minutes: 60
```

Source: GitHub, "Workflow syntax", `jobs.<job_id>.timeout-minutes`: "The maximum number of minutes to let a job run before GitHub automatically cancels it. Default: 360" (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). GitHub, "Reusing workflow configurations": a job that calls a reusable workflow can use only `name`, `uses`, `with`, `secrets`, `strategy`, `needs`, `if`, `concurrency`, `permissions` and `cache-mode`, so the caller cannot carry the timeout itself (https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations). The value 60 is this pack's ruling: one backstop for a stuck job, never a budget; a slow job is fixed at its cause.

Gate: judge
