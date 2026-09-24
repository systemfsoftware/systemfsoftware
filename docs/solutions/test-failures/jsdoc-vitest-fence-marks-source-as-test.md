---
title: "A JSDoc example fence tagged import.meta.vitest turns a source module into a test file"
date: 2026-09-24
category: test-failures
module: effect-atom
problem_type: test_failure
component: testing_framework
symptoms:
  - "Browser-mode Vitest fails every file with `TypeError: Failed to fetch dynamically imported module`"
  - "Vitest reports `The iframe \"…/src/ScopedAtom.ts\" did not become ready within 60000ms`, which names a source module rather than a test file"
  - "`vitest list` shows a `src/` module with no `if (import.meta.vitest)` block collected as a test file"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags:
  - vitest
  - includeSource
  - in-source-tests
  - browser-mode
  - jsdoc
  - effect-atom
---

# A JSDoc example fence tagged import.meta.vitest turns a source module into a test file

## Problem

The shared base config (`packages/toolchain/vitest-config/lib/base.js`) sets `includeSource: ['src/**/*.{js,ts}']`. For each file that glob matches, Vitest collects the file as a test file when its text contains the literal `import.meta.vitest` anywhere. Vitest does not parse the file first, so a comment counts too.

Doc examples inherited from upstream effect-atom opened their code fences with `` ```ts import.meta.vitest ``. In the React package's scoped-atom module (then `ScopedAtom.ts`, now `scoped-atom.resource.ts`), that literal made Vitest collect the module as a test in both the node and browser projects. The browser project then loaded it in a tester iframe. The iframe never became ready, and the whole browser run failed with dynamic-import errors that pointed at the test files, not the real cause. The same marker was also in the core `withEquality` doc example in `atom-combinators.resource.ts`.

## Root cause

The file-selection heuristic matches the `import.meta.vitest` string, not an `if (import.meta.vitest)` block. A doc fence carrying that info string passes the test even though nothing in the module runs as a test.

## Solution

Tag doc example fences as plain `` ```ts ``. Reserve `import.meta.vitest` for real in-source test blocks, which `in-source-test-targets-private` already requires to sit at module level.

## Prevention

When a browser-mode run fails with an iframe timeout that names a `src/` file, search the package's `src/` for the literal `import.meta.vitest` before debugging resolution or dependency optimization.
