---
title: Property defaults read process.env in a browser runner whose process has no env
date: "2026-11-13"
track: knowledge
problem_type: test_failure
category: test-failures
module: "@systemfsoftware/vitest"
component: property-defaults setup entry and internal/property/defaults
tags: [vitest, browser, process-env, property-test, arbitrary]
severity: high
captured: 2026-11-13
last_updated: 2026-11-13
---

# Property defaults read process.env in a browser runner whose process has no env

## Problem

The browser test runner defines a `process` global without an `env` property. `@systemfsoftware/vitest/property-defaults` guarded its read with `typeof process === "undefined"` only. With `process` defined and `env` absent it passed `undefined` to `propertyTestDefaults`, and `tierOf` then indexed `env["AGENT"]` on `undefined`. Browser tests in frontend (`effect-atom-react`, `effect-atom`) failed on load with `TypeError: Cannot read properties of undefined`.

Frontend worked around it in PR #43 by shimming `process.env` in both packages' `vitest.config.ts`. That shim is a workaround for this defect.

## Cause

- `packages/runner/vitest/src/property-defaults.ts`: `process.env` read behind a `typeof process` check only.
- `packages/runner/vitest/src/internal/property/defaults.ts`: `process.env` read unguarded in `providedCheckDefaults`, the engine fallback when a run supplies no budget. Same pattern, same browser runner.

Reproduced with a browser-like `process = {}`: the old guard throws `TypeError: Cannot read properties of undefined (reading 'STRYKER_MUTATOR_WORKER')`; the new guard returns the empty record and tier `local`. Node (`process.env` present) and no-`process` results are unchanged.

## Solution

Treat a `process` without `env` the same as an absent `process`: the record is empty. Both reads use that guard.

## Prevention

Do not read `process.env` in code a browser runner loads without checking that `env` exists.
