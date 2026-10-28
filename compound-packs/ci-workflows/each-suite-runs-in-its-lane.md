---
title: A pull request runs only lint and typecheck, a merge-queue batch runs the test suites, a push to main runs no checks, and the full matrix and mutation run nightly on main
applies_when:
  - adding or changing a workflow trigger, or what a job runs
  - adding a test suite, a VM test or a machine-image build to CI, or moving one to another event
  - adding a check on a different event than the job it would join, or splitting it into a job for that reason
  - wiring a job into another through needs: or a called reusable workflow
tags: [ci, lanes, triggers, merge-queue, nightly, mutation]
---

Each kind of run has one lane, and a job runs only its lane's work:

- A pull request's own run (every push to its branch) runs lint, of code, commit messages, changesets and the pull-request title, and typecheck. Nothing else.
- A merge-queue batch run (a `merge_group` event, or the batch pull request a queue tool opens) runs lint, typecheck and the test suites: unit, integration, browser, Storybook and property tests.
- A push to main runs no check and no test suite. Its jobs write the cache and release or deploy.
- The full test matrix and mutation testing run on a nightly schedule on main and on a manual dispatch on main.
- A check that must run on a different event than the job it would join gets its own job; a difference only in event type, such as a pull request's `edited` activity, is resolved with an `if:` inside the shared job, not a new job (a-check-gets-its-own-runner-only-for-a-named-reason.md).
- A VM test or a machine-image build never runs in a job that a pull request's own run or a merge-queue batch reaches, whether directly, through `needs:`, or through a called reusable workflow.

Decision test: for each job the diff adds or changes, list every event that reaches it, directly, through `needs:` or through a called reusable workflow, and list what it runs. The diff fails when a check on a different event is folded into a job its event does not reach, or when a job is split out only because of an event type that an `if:` could select, or when a pull request's own run reaches anything but lint and typecheck, when a test suite runs on a pull request's own run or on a push to main, when the full matrix or mutation runs on any event but the nightly schedule or a dispatch on main, or when a VM test or image build is reachable from a pull request or a queue batch.

Defect prevented: every push to a pull request waits for, and pays for, suites that judge the merged result rather than the draft. A push to main repeats the checks the queue already ran on the exact tree that landed. A VM test or image build in the pull request's path turns a minutes-long answer into a much longer one.

```yaml
# WRONG: the pull request's own run reaches the browser suite and a VM test
on: [pull_request, push]
jobs:
  lint-typecheck:
    steps:
      - run: pnpm lint
      - run: pnpm typecheck
  browser:
    needs: lint-typecheck
    steps:
      - run: pnpm test:browser
  vm:
    steps:
      - run: nix build .#checks.x86_64-linux.vm-test
```

```yaml
# RIGHT
on:
  pull_request:
  merge_group:
jobs:
  lint-typecheck:
    steps:
      - run: pnpm lint
      - run: pnpm typecheck
  tests:
    if: github.event_name == 'merge_group'
    steps:
      - run: pnpm test
```

Source: Martin Fowler, "Continuous Integration" (2024), on the deployment pipeline: "The commit build is the one that has to be done quickly", and "Since the secondary build may be much slower, it may not run after every commit" (https://martinfowler.com/articles/continuousIntegration.html). GitHub, "Managing a merge queue": the queue makes sure a pull request's changes "pass all required status checks when applied to the latest version of the target branch" together with the pull requests already queued (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Which suite sits in which lane is this pack's ruling.

Gate: judge
