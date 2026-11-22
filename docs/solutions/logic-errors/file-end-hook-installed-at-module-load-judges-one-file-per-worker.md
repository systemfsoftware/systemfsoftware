---
module: vitest
date: 2026-11-22
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - "Under isolate: false, a property file whose every property is vacuous passes when another test file ran before it in the same worker"
  - "The same two files under isolate: true fail the property file with VacuousProperty"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - vitest
  - isolate
  - afterAll
  - property-testing
---

# A file-end hook installed at module load judges only the first file in a worker

## Problem

The runner's constant-impostor vacuity gate kept one ledger and registered one `afterAll` when the package module first evaluated. Two files in one worker (`maxWorkers: 1`, `fileParallelism: false`), the property file second: with `isolate: true` the property file failed as `VacuousProperty`; with `isolate: false` both files passed.

## Root cause

With `isolate: true` Vitest gives every test file a fresh module cache, so module-level code runs once per file and a module-level `afterAll` lands on each file's own root suite. With `isolate: false` the worker keeps one module cache across files. The package's module-level code ran only while the first file was collecting, so the one `afterAll` belonged to that file. Every later file recorded its verdicts into the shared ledger, and nothing finalised them at that file's end.

Module-level state in a library that test files import is per worker, not per file, whenever isolation is off.

## Solution

Key the ledger by test file and install the file-end hook on the running file's own suite hooks (`TestRunner.getSuiteHooks(file).afterAll`) the first time one of that file's properties runs. Take the task's file, not the current collector, so a property inside a nested `describe` is still judged when its file ends. Finalise each file's ledger once.

The conformance scenario `packages/runner/vitest-conformance/tests/vacuity-isolation.integration.test.ts` runs the two-file case under both isolate modes and asserts the refusal by its tag, its file and its property.

## Prevention

Any per-file judgement a library makes (a ledger, a counter, a file-end check) must hang off the file the running task belongs to, never off module evaluation. Test it with two files in one worker under `isolate: false`, the judged file second.
