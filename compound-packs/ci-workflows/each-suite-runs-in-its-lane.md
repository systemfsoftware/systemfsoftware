---
title: A pull request runs only lint and typecheck, main runs only the cache write, and heavier suites run per merge-queue batch or nightly
applies_when:
  - adding or changing a workflow trigger, a job, or what a job runs
  - adding a suite to CI or moving one between lanes
tags: [ci, lanes, merge-queue, nightly, mutation]
---

- A pull_request trigger runs only lint (of code, commit messages, changesets and the PR title) and typecheck.
- Browser, Storybook and property suites run once per merge-queue batch (merge_group), never on pull_request or push.
- A push to main runs no check or test suite; its jobs are the cache write and the release.
- The full test matrix and mutation run on a nightly schedule on main and on workflow_dispatch on main, never on push, pull_request, merge_group or a branch.
- No job a pull_request trigger reaches, directly, through needs: or through a called reusable workflow, runs a later lane's suite, a VM test or a machine-image build.

Gate: judge
