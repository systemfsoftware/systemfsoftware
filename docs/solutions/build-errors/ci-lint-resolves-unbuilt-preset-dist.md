---
title: A config loaded by another package's lint task resolves unbuilt dist unless turbo orders it
module: oxlint-plugin subtree baseline
tags: [turbo, lint, config-resolution, dist, ci-only, pnpm-404]
problem_type: build_error
severity: high
date: 2026-09-12
---

## Symptom

`pnpm check:local` green; CI's `pnpm check:ci` failed thirteen `#lint` tasks at once
(`oxlint-import-origin`, `oxlint-make-boundary`, every plugin leaf) plus
`oxlint-preset#test`. Each lint failure:

```
Failed to load config: .../packages/oxlint-plugin/oxlint.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '.../node_modules/@systemfsoftware/oxlint-preset/dist/index.mjs'
```

The tarball test failed with `ERR_PNPM_FETCH_404` for a debut leaf that the same
test skips locally.

## Root cause

Two independent fidelity gaps, both invisible on a warm tree:

1. **Positional dependency.** Leaf `lint` scripts run `oxlint .` with no `--config`;
   oxlint walks up and loads the subtree baseline `packages/oxlint-plugin/oxlint.config.ts`.
   That config imports `@systemfsoftware/oxlint-preset` — resolved through the workspace
   link to `dist/index.mjs`. The leaf packages do not declare that dependency, so the
   package graph never sees it; turbo's `lint.dependsOn: ["^build", "build"]` orders
   declared dependencies only, and the preset builds in parallel with the leaves. First
   clean-checkout run = dist absent = every leaf that inherits the baseline fails.
2. **Skipped-path regex fidelity.** `requireInstalled` skips on 404 with the pattern
   `\[ERR_PNPM_FETCH_404\][^\n]*registry\.npmjs\.org[^\n]*Not Found`. pnpm's actual
   output prints `ERR_PNPM_FETCH_404` without brackets, splits the registry URL and the
   `Not Found` across lines, and wraps `is not in the npm\n registry`. `[^\n]*` cannot
   cross those newlines, so the intended skip fell through to `throw` in CI.

## Invariants

- A config file loaded by another package's task is a positional dependency: the task
  graph cannot order it, so either declare it (`turbo.json` task `dependsOn:
  ["<pkg>#build"]`) or make the config dependency-free at load time.
- A skip-with-cause guard must be written against the tool's printed bytes, captured
  from a real failing run — not from memory of the documented error code. Wrap-tolerant
  classes (`[\s\S]*`, `\s+`) where pnpm wraps; verify old AND new regex against the same
  fixture and require old=false, new=true.

## Fix

- `turbo.json` `lint.dependsOn` gained `"@systemfsoftware/oxlint-preset#build"`
  (verified by deleting the preset `dist/` and watching `turbo run lint` rebuild it
  before linting a leaf).
- `tarball.test.ts` regexes rewritten to `ERR_PNPM_FETCH_404[\s\S]*registry\.npmjs\.org[\s\S]*Not Found`
  and `is not in the npm\s+registry`, checked against the verbatim CI log bytes.
