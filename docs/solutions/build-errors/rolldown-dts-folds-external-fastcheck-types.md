---
title: "tsdown dts fold of star-exported external types emits an unresolved helper namespace"
date: 2026-09-03
category: build-errors
module: in-source-catalog
problem_type: build_error
component: tooling
symptoms:
  - "api-extractor fails with \"Symbol not found for identifier: FastCheck_d_exports\" while tsdown itself reports a successful build"
  - "dist/index.d.ts references a helper namespace (`FastCheck_d_exports.Arbitrary`) that no region in the file declares"
  - "consumer `tsc` would fail on the published types even though every in-workspace gate compiled against src"
root_cause: dts-star-export-fold
resolution_type: config_change
severity: high
tags:
  - tsdown
  - rolldown-plugin-dts
  - dts
  - fast-check
  - api-extractor
  - never-bundle
fix_prs: pending
---

# tsdown dts fold of star-exported external types emits an unresolved helper namespace

## Problem & Observable Boundary

A build artifact (`index.d.ts` in the package `dist` output) carried `import * as import_fast_check from "fast-check"` at the top but referenced `FastCheck_d_exports.Arbitrary` at the use sites — the fold helper was emitted under one name and referenced under another, so the identifier resolves nowhere. The artifact is broken for consumers too (their `tsc` cannot resolve it); api-extractor is merely the first gate that reads the shipped dts through a consumer lens.

Boundary: the fold fires when a public type reaches through a module whose dts is a pure `export * from 'fast-check'` re-export (the `effect/testing/FastCheck` shape) **and** tsdown is bundling node_modules types into the dts output (the default). `deps.neverBundle: true` keeps such modules external and the bug never triggers.

## Mechanism & Failure Modes

1. **Source-condition folding.** Workspace tsconfigs set `customConditions: ["@systemfsoftware/source"]`; tsdown's dts pass therefore resolves `effect/testing/FastCheck` to sources and treats the module as internal, folding it into the entry dts.
2. **Star-export helper rename mismatch.** Folding a star-export requires a synthetic helper namespace; rolldown-plugin-dts 0.27.14 emits the helper's import as `import_fast_check` but rewrites use sites to `FastCheck_d_exports`, and the helper declaration itself is dropped. Package-name-external logic (peer deps) does not save you — the fold decision happens after resolution.
3. **Import-shape insensitivity.** `import type * as FastCheck`, `import type { Arbitrary }`, and `type X = Arbitrary<A> & B` all produced the identical broken dts — the plugin rewrites every reference to the folded namespace regardless of the source import form. Changing the import shape cannot fix this.
   Boundary: the fold fires when a public type reaches through a module whose dts is a pure `export * from 'fast-check'` re-export (the `effect/testing/FastCheck` shape) **and** tsdown is bundling node_modules types into the dts output (the default — the build output directory, not a tracked tree). `deps.neverBundle: true` keeps such modules external and the bug never triggers.

## Resolution

In `tsdown.config.ts`:

```ts
export default defineConfig({
  // ...
  deps: { neverBundle: true }, // skipNodeModulesBundle is the deprecated alias
})
```

All node_modules types stay external; the dts emits `import { Arbitrary } from "effect/testing/FastCheck"` and api-extractor folds it as an external reference — the same shape long-standing api reports in this repo already use. Safe for library packages whose runtime has no bundled deps (verify the JS output keeps no imports it should bundle). Prefer an intersection **type alias** over `interface extends` for the branded surface: the alias emits the cleanest external reference and lets `it.prop` consume the branded value with no bridging code.

## Verification & Prevention

- Gate: `pnpm build` (tsdown + api:check) exits 0 and the emitted entry dts contains no identifier without a declaration in the same file — grep the built output for `_d_exports` on any dts-adjacent change.
- `attw --pack .` validates the resolution shape after the externals flip.
- When a public API must reference a third-party type behind a namespace re-export (`effect/testing/*`), set `deps.neverBundle` **before** the first api report is committed, or the first report you commit is a description of a broken artifact.

## Related

- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md` — adjacent class: the tsgo emitter dropping public names from bundled entry re-exports (name-drop vs fold-helper mismatch; same consumer-lens lesson).
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — `exports.types` path drift.
