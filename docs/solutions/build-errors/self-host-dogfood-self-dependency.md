---
title: "A dogfooding extractor package cannot bin-link itself: turbo self-cycle and the missing pnpm shim"
date: 2026-09-22
category: build-errors
module: api-extractor
problem_type: build_error
component: tooling
symptoms:
  - "turbo build fails with \"@systemfsoftware/api-extractor#build depends on itself\""
  - "After removing the self devDependency, the build dies with \"api-extractor: command not found\" because the pnpm bin link only exists for declared dependencies"
root_cause: config_error
resolution_type: config_change
---

## Problem

A package that gates its own public surface with its own engine (self-hosting dogfood: the `build`/`api:check` scripts run the extractor against the package's own freshly built declarations) needs its CLI executable at build time. The first wiring declared the self-dependency `"@systemfsoftware/api-extractor": "workspace:*"` so the `api-extractor` bin shim would exist in `.bin`. Two failures followed in sequence:

1. turbo refused the graph: `@systemfsoftware/api-extractor#build depends on itself` (exit 1, nothing built).
2. Deleting the self-dependency fixed the cycle but broke the script: `sh: api-extractor: command not found` — pnpm creates `.bin` shims only for declared dependencies, and a workspace package cannot be its own dependency.

## Failure mechanism

Bin-name invocation requires a dependency edge: `package B` calling `api-extractor` works because `B` declares a dependency on the engine, so the package manager links the engine's `bin` entry into `B`'s `.bin`. For self-hosting the edge would point from the package to itself, which is simultaneously (a) a cyclic task graph turbo rejects and (b) an edge the linker cannot materialize. The two failure modes are one cause: the invocation style presumes a dependency that cannot exist.

## Architectural invariant

**A self-hosting build gate resolves its engine by built artifact path, never by bin name.** The executable a build gate needs must already exist as a deterministic output of the same build (`tsdown` emits `dist/cli.mjs` before the dogfood step), so the gate invokes the artifact directly:

```json
"build": "tsdown -l warn && node dist/cli.mjs run --local --quiet",
"api:check": "node dist/cli.mjs run --local --quiet",
"api:update": "node dist/cli.mjs run --local"
```

No self edge exists in the graph, and the gate always exercises the code built seconds earlier — never a stale linked copy. Downstream consumers keep normal bin usage (`api-extractor run`); only the self-hosting package uses the path form.

## Prevention

Code smell: any package script that invokes the package's own bin name. When adding a self-hosting gate, wire the script against the emitted artifact path and verify the dependency list contains no self-reference. The observable check: `turbo build` completes without a "depends on itself" error, and the dogfood step runs the artifact whose mtime predates the gate.
