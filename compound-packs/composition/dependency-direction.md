---
title: Dependencies point from applications down to libraries; nothing imports an application, every import is a declared dependency, and the graph has no cycle
applies_when:
  - adding a workspace dependency or an import from another workspace package
  - a library needs a type or a function that currently lives in an application
  - one application needs something another application has
  - moving code between packages, or two packages start importing each other
tags: [composition, dependency-graph, layering, cycles, applications]
---

## Rule

The workspace is a directed acyclic graph with applications only at its top.

- An application imports libraries. It never imports another application.
- A library imports lower libraries. It never imports an application, by dependency, by path, by `import()` or by re-export, and that includes `import type`.
- Every workspace package a unit imports is declared in its `package.json`, and a library declares no runtime dependency it never imports.
- A cycle is fixed by moving the shared piece down into a library both sides import, never by a dynamic import, a type-only import or a duplicated type.

When a library needs something an application holds, the thing moves into a library (shapes between applications go to a contracts library: (pack: composition, contracts-between-applications.md)).

## Why

An application carries a deployment's identity: its bindings, environment, routes and runtime. A library that imports one inherits all of that, cannot run in a second host, and cannot be tested without the application. younna-ai has this edge: `packages/agent/src/conversation/agent-db-rows.ts:1` imports types from the `@younna/workspace` Worker, and `packages/app-runtime/src/personal-apps/bundle-commit.ts` imports values from the `@younna/app-builder` Worker ((pack: composition, evidence/FINDINGS.md) Cycle 006, finding 5; both edges still present at younna-ai `a80c7cb3b6`, 2026-10-23, lines 1 and 12/19). No existing pack or lint rule in that tree reported it ((pack: composition, evidence/FINDINGS.md) Cycle 007, "What they miss" 1).

## Evidence

- Rat Stack's boundary lint, `rat-stack/scripts/oxlint-plugin-boundaries.ts:888-891`: "Packages cannot import application code." and "apps/infra owns its Stack wiring; import a capability or service contract instead."
- TanStack: `query/packages/query-core/package.json` has no dependencies or peers; every framework adapter depends on it and never the reverse ((pack: composition, evidence/FINDINGS.md) Cycle 000, finding 1).
- Effect fails CI on cycles (`effect-smol/scripts/circular.mjs`, madge over `packages/*/src`); Deno std has `std/_tools/check_circular_package_dependencies.ts` ((pack: composition, evidence/FINDINGS.md) Cycles 002-003).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/agent/src/conversation/agent-db-rows.ts - a library reaching into a Worker
import type { AgentRow } from '@younna/workspace/schema/agent-db'

// RIGHT: the schema lives in a library both the Worker and the agent library declare and import
import { AgentDb } from '@younna/agent-db'
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-graph` (`scripts/tools/repo-checks/composition.ts`, `checkCompositionGraph`). It builds each unit's import graph with the TypeScript compiler from the unit's own tsconfig, resolving every import, export-from, dynamic import and require through the target's `exports` map and conditions (`scripts/tools/repo-checks/package-exports.ts`, `composition-facts.ts`). It fails on:

- any edge into a unit whose `unit` is `application` (declared or imported);
- an imported workspace package that is not declared;
- a runtime dependency a library declares and never imports (for an application, a template or a unit with no declared kind this is reported, not failed, since it may be installed as a toolchain);
- any cycle between units (strongly connected components).

An import inside a string, template or comment is not an import. Run: `nix run github:systemfsoftware/systemfsoftware#repo-checks -- composition-graph`.
