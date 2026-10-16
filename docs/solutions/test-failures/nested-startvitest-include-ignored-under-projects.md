---
title: "A nested startVitest include override is ignored once the package config declares projects"
date: 2026-09-25
category: test-failures
module: trace-spec
problem_type: test_failure
component: testing_framework
symptoms:
  - "CI `test` job for `@systemfsoftware/trace-spec` runs for minutes, then every scenario of one file fails with `Test timed out in 60000ms`"
  - "A nested run meant to execute one fixture reports queued files from the package's whole `tests/` and `src/` tree, the calling test file included"
root_cause: config_error
resolution_type: test_fix
severity: high
tags:
  - vitest
  - startVitest
  - projects
  - nested-runner
  - trace-spec
---

# A nested startVitest include override is ignored once the package config declares projects

## Problem

trace-spec's annotation-on-disparity integration test called `startVitest('test', [], { include: [<fixture>] })` from inside a test to run one fixture spec and read its annotations. After #526 made `@systemfsoftware/vitest-config` split a package with conformance files into `unit` and `conformance` projects (its `splitProjects` helper), the nested run loaded the package config. Each project brought its own `include`, and the root `include` override no longer narrowed anything. The nested run executed the whole suite, including the calling file, which started another nested run. It recursed until every scenario hit the package's 60 s `testTimeout` (run 36080352408).

## Root cause

Vitest resolves `include` per project. A root-level `include` passed to `startVitest` applies only when the config has no `projects`. A probe logged the files each nested run queued: every `src/` and `tests/` file of both projects, not the one fixture.

## Solution

We deleted the test, its three fixtures, and the package-wide 60 s `testTimeout` that existed only for nested runs. No test in the package starts a second vitest now.

## Prevention

- Before calling `startVitest` from a test, check whether the package config declares `projects`. If it does, the root `include` does nothing. Pass `config: false` with an explicit `root`, `include`, and resolve conditions, or don't nest a runner at all.
- A nested runner inherits every config change made to its package later. The #526 split broke this test without touching it.
