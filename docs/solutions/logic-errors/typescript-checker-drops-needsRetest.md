---
title: "TypeScript checker records ambiguous group mutants as passed"
date: 2026-08-27
category: logic-errors
module: stryker-js-typescript-checker
problem_type: logic_error
component: testing_framework
symptoms:
  - "Two mutants in one project file produce a compiler error that cannot be blamed on exactly one of them, and both are reported passed"
  - "The mutation report understates compile-error counts and spends the test budget on mutants that do not typecheck"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - typescript-checker
  - needsRetest
  - mutation
---

# TypeScript checker records ambiguous group mutants as passed

## Problem

A grouped typecheck that cannot attribute a diagnostic to exactly one mutant still sent every mutant to the test runner as `passed`.

## Symptoms

- Ambiguous pair both `passed`
- Compile-error count too low

## What Didn't Work

- Relabeling the whole group `compileError` (false compile error on the valid mutant)
- Pure in-memory host filesystem (compiler init reads the TypeScript install off the host filesystem)
- Vitest `resolve.alias` onto the package entry (bypasses the export map)

## Solution

Classification already fills `needsRetest`. The result builder must not default those ids to `passed`. The shell rechecks each remaining mutant alone, then merges `passed` / `compileError`.

Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker test` includes a mixed pair that fails if both come back `passed`.

## Why This Works

A second compiler read is a second sandwich, not I/O inside the decision. The host filesystem stays real; the hybrid overlay holds mutant contents.

## Prevention

- A mixed-pair live check through the plugin must fail if both ids are `passed`
- Tests that import the package consume `exports.default` (`dist/`); build before asserting on unpublished source

## Related Issues

- https://github.com/systemfsoftware/systemfsoftware/issues/278
