---
title: Bundler-Only Export Condition Breaks an Externalized Dependency Under Vitest
track: knowledge
problem_type: build_error
category: build-errors
module: trace-spec
component: vitest resolve conditions
tags: [export-conditions, vitest, opentelemetry, externalized-dependency, esm-resolution]
severity: medium
captured: 2026-09-22
last_updated: 2026-09-22
---

# Bundler-only `module` condition breaks an externalized dependency under Vitest

## Problem

Any suite importing `@effect/opentelemetry` — directly or transitively — dies at import time with `Cannot find module '…/@opentelemetry/api/build/esm/baggage/utils'`. Vitest reports the file as a failed _suite_ with `(0 test)`, so the failure names a missing internal module of a third-party package rather than anything in the suite.

## Mechanism

`@opentelemetry/api` ships three builds behind export conditions: `esnext`, `module`, `types`, and `default`. Its `module` build emits extensionless relative specifiers (`./baggage/utils`), which only a bundler's resolver completes. Its `default` build is CommonJS with complete specifiers and loads under Node.

Two independent decisions collide:

1. **Condition selection.** Vite's default server conditions include `module`, so the SSR resolver picks the bundler build.
2. **Externalization.** Vitest externalizes dependencies by default, handing the selected entry to Node's loader rather than transforming it.

The failure is the intersection: condition selection assumes a bundler will finish resolution, externalization guarantees none runs. Either decision alone is harmless — bundling the `module` build works, and externalizing the `default` build works.

$$\text{loadable} = \text{conditions choose an entry} \land \text{whoever loads that entry can resolve its specifiers}$$

## Architectural invariant

**Resolve conditions are a contract with whoever loads the module, not a style preference.** A condition that names a build shape (`module`, `esnext`, `browser`) is a claim about the _consumer's_ capabilities. When a runner externalizes a dependency, the consumer is the runtime loader, so the condition set must exclude every condition whose build assumes a bundler.

Stated as a rule for any test runner over a package graph the runner does not bundle:

```
externalized(pkg) ⇒ conditions(pkg) ∩ bundler_only_conditions = ∅
```

`bundler_only_conditions` is the set whose builds are permitted incomplete specifiers, extensionless imports, or non-standard syntax: `module` and `esnext` in the OpenTelemetry family.

## Fix

The consuming package overrides its SSR resolve conditions, dropping `module` while keeping the workspace source condition that makes sibling packages resolve to their sources:

```ts
const serverConditionsWithoutBundlerModule = ['node', 'development|production', '@systemfsoftware/source']

export default defineConfig({
  ...sharedConfig,
  ssr: { resolve: { conditions: serverConditionsWithoutBundlerModule } },
  test: {/* … */},
})
```

The override belongs to the package that owns the dependency, never to the shared Vitest preset: every other package still wants the default conditions, and a repo-wide edit would change entry selection for dependencies nobody examined.

## What does not work

Inlining the package (`test.server.deps.inline` matching `@opentelemetry/`) leaves the failure unchanged. Inlining decides _who transforms_ a module that has already been resolved; the broken entry was chosen by the condition set before that decision is reached.

## Code smells

- A shared test preset that hardcodes conditions and is spread by every package: the fix for one dependency silently changes entry selection for all of them.
- A `catch` around a dynamic import of an SDK to "handle missing optional telemetry": it converts this deterministic resolution failure into a silent no-telemetry run, which a trace contract then reports as an empty observation.
- Pinning the workaround in a lockfile patch or a vendored copy instead of the condition set: the next version bump reintroduces it.

## Verification

Two-sided: with `module` present in the conditions the suites fail to import; with it removed the whole suite runs. The `trace-spec` package's suite is the standing witness — it imports the OpenTelemetry tracer bridge and the in-memory exporter, so a regression in the condition set fails it at import rather than at assertion.

The written-out condition list drifts silently if Vite changes its defaults. The drift fails loudly (module not found), never subtly.
