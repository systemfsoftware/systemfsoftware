---
title: Pull requests run lint and typecheck, merge queues run tests, main runs no checks, and nightly runs matrix and mutation
applies_when:
  - adding or changing a workflow trigger, or what a job runs
  - adding a test suite, a VM test or a machine-image build to CI, or moving one to another event
  - adding a check on a different event than the job it would join, or splitting it into a job for that reason
  - wiring a job into another through needs: or a called reusable workflow
tags: [ci, lanes, triggers, merge-queue, nightly, mutation]
---

Each CI run belongs to one lane. A job runs only its lane's work:

- **Pull request**: lint code, commit messages, changesets, and the PR title; run typecheck. Nothing else.
- **Merge queue** (`merge_group` or queue batch PR): lint, typecheck, and test suites (unit, integration, browser, Storybook, property tests).
- **Push to main**: no checks and no tests. Write cache, release, or deploy only.
- **Nightly schedule or manual dispatch on main**: full test matrix and mutation testing.
- **VM tests and machine-image builds**: never reachable from a pull request or merge-queue run, whether directly, through `needs:`, or through a called workflow.
- **Job splitting**: create a separate job only when a check runs on a different event. Use an in-job `if:` when only the event activity type differs, such as `pull_request` `edited` (see `a-check-gets-its-own-runner-only-for-a-named-reason.md`).

Decision test: trace every trigger event that reaches the added or changed job directly, via `needs:`, or via called workflows. Fail the diff if:

- A pull request run executes anything other than lint and typecheck.
- A test suite runs on a pull request run or on a push to main.
- A push to main executes any check or test suite.
- Matrix or mutation tests run on any event other than a nightly schedule or a manual dispatch on main.
- A VM test or machine-image build is reachable from a pull request or merge-queue run.
- A job is split solely for an event activity type that an in-job `if:` can select.
- A check is placed in a job whose event trigger does not reach it.

Defect prevented: pull requests wait and pay for test suites that evaluate the merged result rather than the draft. Pushes to main duplicate checks already run by the merge queue. VM tests or image builds in the pull request path delay feedback.

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
