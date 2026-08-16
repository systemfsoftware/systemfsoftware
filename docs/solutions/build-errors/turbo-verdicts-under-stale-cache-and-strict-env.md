---
module: repo tooling
date: 2026-08-16
problem_type: build_error
component: tooling
severity: high
symptoms:
  - "`pnpm check:local` exits 0 while packages in the same workspace do not compile"
  - "a workspace-wide migration census under-reports the red set, so packages are never migrated"
  - "browser tests pass standalone and fail under `turbo run` with \"Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1234\""
  - "`tsc --noEmit --incremental` reports clean on a package whose imports no longer resolve"
root_cause: config_error
resolution_type: config_change
related_components:
  - development_workflow
  - testing_framework
tags:
  - turbo
  - cache
  - env-mode
  - playwright
  - tsbuildinfo
  - migration
---

# Turbo's verdict is not evidence during a cross-cutting migration

## Problem

During the Effect v4 workspace cut-over, three separate verdicts were false at the same time:

1. `TURBO_CONCURRENCY=100% pnpm typecheck` reported a red set of ~30 packages. The real red set was larger: packages whose hashes had not changed replayed **cached pre-migration green** results, so they were never migrated. `vitest-config`, `stryker-js/plugin-api`, `oxlint-plugins/recommended` and `cell-taxonomy` all sat in that blind spot.
2. Every package's `typecheck` script runs `tsc --noEmit --incremental`. A `tsconfig.tsbuildinfo` written **before** a dependency-graph change keeps reporting clean afterwards, because unchanged files are not re-checked. Deleting the 48 `tsbuildinfo` files turned a "green" workspace red — `vitest-setup.ts` files still importing `FastCheck` from `'effect'` had been invisible for the whole migration.
3. Browser tests passed under `pnpm test` and failed under `turbo run test`. Turbo 2 defaults to strict environment mode: a task receives only declared variables plus a system allowlist. `XDG_CACHE_HOME` is not in it, so Playwright fell back to `$HOME/.cache/ms-playwright` and could not find the browser build that exists under the real cache root.

## Root cause

Two independent mechanisms, both of which make a gate answer a question it was not asked:

- **Cache keys hash inputs, not the environment the inputs resolve against.** A catalog flip rewrites `pnpm-lock.yaml` and `node_modules`, but a package whose own files did not change keeps its old hash — so turbo serves the old verdict. The task never ran against the new dependency graph.
- **Strict env mode is silent.** A stripped variable does not error; the task runs with a different view of the filesystem than the developer's shell, and only a tool that reads that variable notices.

A third, unrelated failure in the same session is worth recording as a decoy: a corrupted pnpm store entry — an `effect` package that had lost its whole built-output directory while its sources remained — produced ~100 task failures whose messages pointed at _source_ problems: `Cannot find module 'effect'`, `implicit any`, `TS2305`. None of those were real. `rm -rf node_modules` plus a fresh `pnpm install` cleared all of them. Before believing a broad, incoherent failure set, verify the store with an `ls` of the built output under `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/`.

## Solution

Declare the machine-local cache path as a pass-through, so it reaches tasks without entering the cache key:

```jsonc
// turbo.json
{
  "globalDependencies": ["scripts/tools/patch-tsgo-if-needed.mjs"],
  "globalPassThroughEnv": ["XDG_CACHE_HOME", "PLAYWRIGHT_BROWSERS_PATH"],
  "tasks": {/* ... */}
}
```

`globalPassThroughEnv` is the right key rather than `globalEnv`: the schema at `https://v2-10-1.turborepo.dev/schema.json` defines it as "made available to all tasks, but should not contribute to the task's cache key". A cache path that changed the hash would stop local and CI caches from sharing entries.

For the verdict-fidelity half, the only trustworthy run of a gate during a migration is a cache-free one:

```bash
TURBO_CONCURRENCY=100% pnpm gate:tasks --force   # --force bypasses the cache entirely
```

Deleting stale incremental state belongs in the same sweep, because `--force` re-runs the task but `tsc` still reads its own `tsbuildinfo`:

```bash
rm -f packages/*/tsconfig.tsbuildinfo packages/*/*/tsconfig.tsbuildinfo
```

## Prevention

Treat any cross-cutting change — a catalog flip, a major upgrade, a lockfile rewrite — as invalidating every cached verdict, whether or not the cache agrees. Establish the red set with `--force` **before** planning the work; a census taken through the cache plans the wrong work, and every package it silently omits is discovered later, at a point where it looks like a regression the migration caused.

When a task passes standalone and fails under turbo, suspect the environment before the code: the difference between the two is exactly the variables turbo declines to pass.
