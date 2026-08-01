---
title: tsdown externalizes `dependencies` — private workspace helpers in `dependencies` break a plugin's dist outside the monorepo
date: 2026-07-20
category: build-errors
module: plugin-distribution
problem_type: build_error
component: tooling
severity: high
symptoms:
  - "dist/index.js contains a bare import of a private workspace package (`from \"@systemfsoftware/omp-utils\"`)"
  - "all local builds, tests, and smoke loads pass — workspace node_modules always resolves the private package"
  - "the same dist is unresolvable outside the workspace (published tarball or fresh install): the private package is never published"
root_cause: config_error
resolution_type: config_change
tags: [tsdown, bundling, dependencies, devdependencies, workspace, dist, plugin-distribution]
---

# tsdown externalizes `dependencies` — private workspace helpers in `dependencies` break a plugin's dist outside the monorepo

## Problem

A private workspace package (`@systemfsoftware/omp-utils`) listed in `dependencies` of a publishable plugin (`omp-agent-discipline`) was externalized by tsdown at bundle time, producing a dist whose imports only resolve inside the monorepo.

## Symptoms

- `omp/plugins/omp-agent-discipline/dist/index.js` contained a top-level static import:
  ```js
  import { createTelemetry, loadToml } from '@systemfsoftware/omp-utils'
  ```
- Inside the monorepo, every `pnpm test`, `pnpm build`, and local smoke load succeeded — pnpm resolves `@systemfsoftware/omp-utils: "workspace:^"` via the workspace link regardless of dependency category.
- Outside the workspace (published tarball, fresh install, plugin-link from another project), that import is unresolvable: `@systemfsoftware/omp-utils` is `"private": true` and never published, and the plugin tarball ships only its gitignored build output. Found by static analysis during code review — never observed as a runtime crash, because nothing ever loaded the dist from outside the workspace.

## What Didn't Work

| Check that stayed green                                          | Why it masked the bug                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace smoke tests                                            | `pnpm test` and the smoke tool ran inside the monorepo; pnpm's workspace protocol resolves `"workspace:^"` whether the entry sits in `dependencies` or `devDependencies`. Category only matters at bundle time, not at local resolution time. |
| Post-build `verify-dist` (`omp/scripts/check-dist-builtins.mjs`) | Only checks expected Node builtins (`node:fs`, `node:path`) — never scans for bare workspace-scope imports.                                                                                                                                   |
| `scripts/release.mjs --dry-run`                                  | Discovers publishable packages and packs them; never imports the packed tarball's dist to verify resolution.                                                                                                                                  |
| Sibling plugin as reference                                      | `omp-claude-compat` had the same import in source but was never affected — its `omp-utils` entry was in `devDependencies` all along, so tsdown inlined it. The divergence hid in `package.json`, not in code.                                 |

## Solution

Commit `0b4bab7ec0` (branch `feat/omp-plugin-practice`, unpushed as of writing) — move `@systemfsoftware/omp-utils` from `dependencies` to `devDependencies` in `omp/plugins/omp-agent-discipline/package.json`, matching `omp-claude-compat`.

Before (broken — tsdown externalizes `dependencies`, bare import survives in dist):

```json
{
  "dependencies": {
    "@systemfsoftware/omp-utils": "workspace:^"
  }
}
```

After (fixed — tsdown bundles `devDependencies`, functions inlined into dist):

```json
{
  "devDependencies": {
    "@systemfsoftware/omp-utils": "workspace:^"
  }
}
```

Verified after rebuild: `grep 'from "@systemfsoftware/omp-utils"' dist/index.js` returns zero matches in both plugin dists (the import is gone; `createTelemetry`/`loadToml` are inlined), the smoke tool loads both dists from a synthetic cwd, all package tests pass (38 in agent-discipline), and root `pnpm check` exits 0.

## Why This Works

tsdown follows the conventional bundler rule (both plugins use the same `deps: { onlyBundle: false }` config — don't restrict bundling to a whitelist):

| Dependency category | Bundle behavior                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| `dependencies`      | **Externalized** — left as a bare import in the output; presumed installable at runtime |
| `devDependencies`   | **Bundled** — inlined into the output                                                   |
| `peerDependencies`  | Externalized (always)                                                                   |

The dependency _category_ is therefore part of a publishable package's distribution contract: it decides what ends up inside the tarball versus what the consumer's environment must provide. A `"private": true` workspace package can never be provided by a consumer's environment, so categorizing it as a runtime `dependency` produces a dist that is green everywhere it can be tested locally and broken everywhere else.

## Prevention

- **Categorization rule:** anything imported by a plugin's runtime code that is `"private": true` (or otherwise unpublishable) goes in `devDependencies` — never `dependencies`. Only real, published packages belong in `dependencies`; private workspace helpers are build-time inputs. Shared private packages should sit in the same category across every consumer so bundling behavior is uniform.
- **Dist scan:** after build, fail on bare workspace-scope imports in the dist:
  ```bash
  ! grep -n 'from "@systemfsoftware/' dist/index.js
  ```
  (The existing `check-dist-builtins.mjs` could grow a `--no-external` flag for this.)
- **Synthetic-cwd smoke:** load the dist from a directory outside the workspace — `node omp/scripts/smoke-plugin.mjs <dist> --cwd /tmp/plugin-smoke` catches resolution failures that workspace-context tests structurally cannot.
- **Review-time greps:** `from "@systemfsoftware/` in `dist/index.js` (externalized private import); a `"private": true` package referenced from any publishable package's `dependencies` (root cause at the source).

## Related Issues

- [tsdown manages publishConfig during build](../tooling-decisions/tsdown-manages-publishconfig-during-build.md) — same tool, adjacent failure class (exports-field drift, not dependency externalization); AGENTS.md REPO-S4 covers exports, not dep categorization.
- [exports/types rollup drift](../build-errors/exports-types-rollup-drift.md) — same verify-the-dist family; note attw only checks type resolution, not import resolubility, so it would not have caught this.
- `.claude/skills/omp-plugin-development/references/manifest-and-packaging.md` — plugin practice skill; covers the peerDep/devDep split for the OMP SDK and the externalize/bundle categorization rule.
- Detected by ce-code-review run `20260720-181925` (ten reviewers; three flagged it as a P1); fixed in `0b4bab7ec0`.
