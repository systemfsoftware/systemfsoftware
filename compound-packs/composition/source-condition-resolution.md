---
title: Workspace packages resolve to their TypeScript source through a custom export condition, so development and tests need neither a build nor a path alias
applies_when:
  - a package imports another workspace package during development or tests
  - configuring tsconfig paths, customConditions, Vite or Vitest aliases for workspace packages
  - a test fails because a sibling package is not built
tags: [composition, resolution, export-conditions, source, dev-loop]
---

## Rule

Each library's exports map carries a custom condition that points at its TypeScript source, ahead of the built output. In this repository the condition is `@systemfsoftware/source`:

```jsonc
"exports": { ".": { "@systemfsoftware/source": "./src/mod.ts", "types": "./dist/mod.d.ts", "default": "./dist/mod.js" } }
```

TypeScript (`compilerOptions.customConditions`), Vite and the test runner enable that condition inside the workspace. Packages and tests import each other by their public specifiers and get source without a build. No tsconfig `paths` entry and no bundler `alias` points into another package's source.

## Why

Without the condition, a workspace reaches source in one of two ways, and both break composition: a path alias that bypasses the exports map (so anything in `src` becomes importable), or a relative `../../other/src` import (so the package boundary disappears). The condition is also what makes (pack: composition, tests-stay-home.md) cheap: a test imports `@scope/ledger` and still runs against source.

## Evidence

- Vitest: `vitest/tsconfig.base.json:5` sets `customConditions: ["__vitest_source__"]`, every export carries `"__vitest_source__": "./src/<entry>.ts"`, and the bundler config enables it ((pack: composition, evidence/FINDINGS.md) Cycle 001, finding 4).
- Effect uses a second map, `publishConfig.exports`, for the same goal ((pack: composition, evidence/FINDINGS.md) Cycle 003, finding 12). One condition is simpler and keeps one map.
- This repository: `packages/oxlint-presets/oxlint-config-cell-architecture/package.json` and its `tsconfig.app.json` `customConditions`.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```jsonc
// WRONG: apps/web/tsconfig.json
"paths": { "@scope/ledger": ["../../packages/ledger/src/mod.ts"] }

// RIGHT: apps/web/tsconfig.json
"customConditions": ["@systemfsoftware/source"]
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-imports` (`scripts/tools/repo-checks/composition.ts`, `checkCompositionImports`) fails a tsconfig `paths` entry (read from the parsed compiler options) or a bundler `alias` (read from the syntax tree of the vite, vitest or astro config) that points into another package, and any import that resolves into another package by path or by a subpath its `exports` map does not admit.
