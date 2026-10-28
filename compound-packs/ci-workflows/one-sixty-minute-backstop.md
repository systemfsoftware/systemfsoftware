---
title: Every job carries timeout-minutes: 60 with no earlier kill
applies_when:
  - adding a job or setting a job's or a step's timeout-minutes
  - wrapping a command in a wall-clock limit, or passing a tool a time cap
  - calling a reusable workflow, or passing a timeout or time cap through with:
tags: [ci, timeout, backstop]
---

Decision test: Read every job, step, wrapper, tool flag, and `with:` block in the diff. The diff fails if:

- A job with `runs-on` lacks literal `timeout-minutes: 60`, uses another value, or reads the value from an expression or input.
- A step sets `timeout-minutes`, wraps a command in a wall-clock limit (`timeout 600 …`), or sets a tool timeout below 60 minutes.
- A job calling a reusable workflow passes a timeout or time cap through `with:` (top-level or nested); called workflows set the backstop in their own jobs.

Per-test timeouts inside a test framework are out of scope.

Defect prevented: A job without a timeout holds a stuck runner for six hours. Caps below 60 minutes kill progressing work, waste runner minutes, leave commits without verdicts, and hide causes behind "exceeded the maximum execution time". A single 60-minute backstop means any timeout indicates a stuck job, not a slow one.

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
