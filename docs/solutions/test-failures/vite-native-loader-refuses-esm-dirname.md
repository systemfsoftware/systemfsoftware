---
title: Vite native config loader refuses CJS globals in ESM vitest configs
date: 2026-08-16
category: test-failures
module: packages/effect-atom
problem_type: test_failure
component: testing_framework
symptoms:
  - "check:ci fails: TypeError: Failed to fetch dynamically imported module in the vitest browser (chromium) project"
  - "vitest 4.1.10 warns: Your Vite config uses features that are unsupported by `configLoader: 'native'` ... Use `import.meta.dirname` instead"
root_cause: config_error
resolution_type: config_change
severity: medium
tags: [vitest, vite, esm, config-loader, browser, playwright, effect-atom]
---

# Vite native config loader refuses CJS-only globals in ESM vitest configs

## Problem

The `check:ci` test gate failed on `@systemfsoftware/effect-atom-react` only
on GitHub Actions: the browser (chromium) test project could not dynamically
import the gherkin feature test file. Locally the same test passed, which
hid the cause from a local-only run.

## Symptoms

- `TypeError: Failed to fetch dynamically imported module: http://localhost:<port>/.../test/Hooks.feature.test.tsx` (verbatim error-message excerpt from the CI gate).
- vitest 4.1.10's config-loader warning: the config "uses features that are
  unsupported by `configLoader: 'native'`" and names `__dirname`, pointing
  to `import.meta.dirname` as the replacement.

## What Didn't Work

- Re-running the package test locally — it passed with the warning still
  printed, so the warning looked cosmetic.
- Assuming the failure was a CI-only flake of the Playwright chromium
  worker. The two observations are one failure: the native loader rejects
  the config, the alias map for package-internal specifiers is never
  applied, and the browser worker's dynamic import of the test file cannot
  resolve its imports — so only the browser project (the only project whose
  test files import by package specifier) fails.

## Root Cause

The two vitest configs for `@systemfsoftware/effect-atom` and
`@systemfsoftware/effect-atom-react` derived their vite `alias` entries with
`path.join(__dirname, ...)`. `__dirname` is a CommonJS-only global; vite
4.1.10's `configLoader: 'native'` evaluates the config as ESM, where the
global is undefined. The loader does not fail hard on the unsupported
pattern — it keeps loading, but the config's path-derived surface is not
carried over, so the browser project fetches test files with unresolvable
package specifiers and the dynamic import fails only in browser mode.

The invariant: an ESM-loaded configuration file must not reference
CJS-only globals (`__dirname`, `__filename`, `require`). Node has provided
ESM-native receivers since 20.11 — `import.meta.dirname` and
`import.meta.filename` — so there is no reason to derive paths from a CJS
global in any config the modern stack loads as ESM.

## Solution

Replace the `__dirname` receiver with `import.meta.dirname` in the vite
`alias` blocks of both vitest configs, preserving the `path.join(alias,
relative)` shape exactly:

```ts
'@systemfsoftware/effect-atom/test': path.join(import.meta.dirname, '../atom/test'),
'@systemfsoftware/effect-atom': path.join(import.meta.dirname, '../atom/src'),
```

Both package test tasks now run clean: `@systemfsoftware/effect-atom` 186
tests, `@systemfsoftware/effect-atom-react` 27 tests (23 browser + 4 SSR),
no `__dirname` deprecation warning, no dynamic-import failure, exit code 0.
Using the builtin receiver also removed the need to import `node:url` and
call `fileURLToPath(import.meta.url)` — one fewer import per file.

## Why This Works

`import.meta.dirname` is the ESM-native name for the directory containing
the module, defined at the same loading boundary the native config loader
uses. Since the repo's configs are already ESM (workspace `type: module`,
Node 22 runtime on the runner and locally), the receiver resolves where
`__dirname` cannot. The alias shape itself is unchanged, so the fix cannot
change what the aliases point at — only that they are defined at all.

## Prevention

- Treat a `configLoader: 'native'` warning as an error-equivalent, not a
  cosmetic note. The failure mode is a silent config-surface drop whose
  first visible symptom lands one layer away (browser dynamic import), not
  an early loud error.
- When writing any config under the workspace with `node:path`, use
  `import.meta.dirname` — check for `__dirname` in configs with the same
  discipline as a lint rule: no CJS-only global in an ESM-loaded file.
- The repo's commitlint classifies `vitest.config.*` as tooling, so such a
  change ships as a `chore` commit, not `fix`.

## Related Issues

- Working fix plan: `docs/plans/2026-08-16-001-fix-vitest-esm-dirname-plan.md`
