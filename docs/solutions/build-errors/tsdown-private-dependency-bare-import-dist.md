---
title: tsdown externalizes `dependencies` — private workspace helpers in `dependencies` break a plugin's dist outside the monorepo
date: 2026-07-20
category: build-errors
module: plugin-distribution
problem_type: build_error
component: tooling
severity: high
symptoms:
  - "dist/index.js contains a bare import of a private workspace package"
  - "all local builds, tests, and smoke loads pass — workspace node_modules always resolves the private package"
  - "the same dist is unresolvable outside the workspace (published tarball or fresh install): the private package is never published"
root_cause: config_error
resolution_type: config_change
tags: [tsdown, bundling, dependencies, devdependencies, workspace, dist, plugin-distribution]
---

# tsdown externalizes `dependencies` — private workspace helpers in `dependencies` break a plugin's dist outside the monorepo

## Problem

A private workspace package listed in `dependencies` of a publishable plugin was externalized by tsdown at bundle time, producing a dist whose imports only resolve inside the monorepo.

## Symptoms

- A plugin's built dist carried a top-level static import of its private workspace helper as a bare `@systemfsoftware/*` specifier.
- Inside the monorepo, every `pnpm test`, `pnpm build`, and local smoke load succeeded — pnpm resolves a `"workspace:^"` entry through the workspace link regardless of dependency category.
- Outside the workspace (published tarball, fresh install, plugin-link from another project), that import is unresolvable: the package was `"private": true` and never published, and the plugin tarball ships only its gitignored build output. Found by static analysis during code review — never observed as a runtime crash, because nothing ever loaded the dist from outside the workspace.

## What Didn't Work

| Check that stayed green | Why it masked the bug                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace smoke tests   | `pnpm test` and local smoke loads ran inside the monorepo; pnpm's workspace protocol resolves `"workspace:^"` whether the entry sits in `dependencies` or `devDependencies`. Category only matters at bundle time, not at local resolution time. |

## Solution

Move the private workspace helper from `dependencies` to `devDependencies` in the consuming package's `package.json`.

Before (broken — tsdown externalizes `dependencies`, bare import survives in dist):

```json
{
  "dependencies": {
    "<private-workspace-package>": "workspace:^"
  }
}
```

After (fixed — tsdown bundles `devDependencies`, functions inlined into dist):

```json
{
  "devDependencies": {
    "<private-workspace-package>": "workspace:^"
  }
}
```

## Why This Works

tsdown follows the conventional bundler rule — `getProductionDeps` collects `dependencies`, `peerDependencies`, `peerDependenciesMeta` and `optionalDependencies` and externalizes those; `devDependencies` alone is bundled (`repos/tsdown/src/features/deps.ts`). A `deps: { onlyBundle: false }` config disables the bundling whitelist rather than restricting bundling:

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
- **Synthetic-cwd smoke:** load the dist from a directory outside the workspace — a resolution failure that workspace-context tests structurally cannot see shows up immediately.
- **Review-time greps:** `from "@systemfsoftware/` in `dist/index.js` (externalized private import); a `"private": true` package referenced from any publishable package's `dependencies` (root cause at the source).

## Related Issues

- [tsdown manages publishConfig during build](../tooling-decisions/tsdown-manages-publishconfig-during-build.md) — same tool, adjacent failure class (exports-field drift, not dependency externalization); AGENTS.md REPO-S4 covers exports, not dep categorization.
- [exports/types rollup drift](../build-errors/exports-types-rollup-drift.md) — same verify-the-dist family; note attw only checks type resolution, not import resolubility, so it would not have caught this.
- Detected by ce-code-review run `20260720-181925` (ten reviewers; three flagged it as a P1).
