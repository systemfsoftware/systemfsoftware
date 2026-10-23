---
title: A private library exports "." only, one mod.ts namespace barrel; no ./testing, no driver, runtime or framework subpaths, and no condition that widens the surface
applies_when:
  - adding a subpath to a library's exports map
  - adding a ./testing, ./postgres, ./d1, ./workerd, ./node, ./server or ./react entry
  - a test or another package wants a file the library does not export
  - a library's exports map has any key besides "."
  - adding a test, vitest or development condition to a library's "." entry
  - adding an exports map to a Worker, SPA, site or CLI
tags: [composition, exports-map, barrel, internal, subpath, conditions]
---

## Rule

A private library (`"private": true`, `"unit": "library"`) has one entry, `.`, pointing at one `mod.ts` namespace barrel (`export * as Ledger from './Ledger.ts'`; barrel shape: (pack: cell-architecture, single-namespace-barrel.md)). The map is `{ ".": ... }` and nothing else. Every other subpath already fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, so internals are unnameable without a `"./internal/*": null` block; that block is needed only by a map that also exports a `"./*"` pattern, which a private library never does.

Each key a library is tempted to add has a home that is not a subpath:

- **Test support** (`./testing`, `./test-utils`). Never an entry. A test Layer other packages' tests need is a public Layer on the service, exported from `.` beside the live one (`Ledger.layerTest`). Fixtures, arbitraries and contract suites several packages' tests share are their own private library (pack: composition, tests-stay-home.md).
- **A driver** (`./postgres`, `./d1`, `./durable-object`). A Layer the application chooses: it lives in that application, or in its own adapter library (pack: composition, drivers-live-where-chosen.md).
- **A runtime difference** (`./workerd`, `./browser`, `./node`). An export condition on `.` pointing at separate files with the same names and types (pack: composition, core-and-adapters.md).
- **A framework binding** (`./react`). Its own adapter library that depends on this one (pack: composition, core-and-adapters.md).

An extra key is justified one at a time, in the change that adds it, and only for one of two reasons: an asset read by path (`./styles.css`), or a file a build tool loads by specifier in a config role (`./vite`, or `./package.json` when a named tool reads it). Two keys that resolve to one file are never allowed in a private library.

Conditions on `.` never widen it. Every condition branch of `.` exports the same names and types (pack: package-topology, condition-branch-agreement.md), and no condition exists for tests: a `test`, `vitest` or `development` branch pointing at a barrel that exports more than the default branch gives tests a wider surface under the same specifier, which is the deep import (pack: composition, tests-stay-home.md) forbids, renamed.

An application or a template has no `exports` field at all; this rule does not apply to it (pack: composition, three-unit-kinds.md). A published library serving consumers outside the workspace decides its surface under (pack: package-topology, declared-entry-points.md); being published does not license a private library's extra keys.

## Why

Every key in an exports map is a contract someone will import. At the research snapshot (2026-10-21) younna-ai's private packages declared 378 subpaths and 149 (39%) had no consumer: `@younna/platform` 61 of 135 unused, `@younna/kit` 34 of 58, `@younna/app-runtime` 28 of 39 ((pack: composition, evidence/FINDINGS.md) Cycle 006). Nothing noticed, because the existing rule bounded names per entry, not entries per package ((pack: composition, evidence/FINDINGS.md) Cycle 007, "What they miss" 2). One barrel removes the choice: a consumer imports `@scope/ledger` and nothing else exists to bind to.

## Evidence

- TanStack Query: `query/packages/query-core/package.json` and `query/packages/react-query/package.json` export exactly `.` and `./package.json`.
- Effect 4 publishes `"./*"` and therefore needs `effect-smol/packages/effect/package.json:51-52` `"./internal/*": null` to close the pattern; casing marks public (PascalCase) against internal (lowercase) modules ((pack: composition, evidence/FINDINGS.md) Cycle 003, findings 3-4). No static import in `effect-smol/packages/effect/test` names `../src`; `test/schema/HMR.test.ts:4,20` reaches `../../src/Schema.ts` and `../../src/SchemaAST.ts` through `vi.importActual` to test module reloading, which is why string-argument loaders count as imports in (pack: composition, tests-stay-home.md).
- Conflicts ruled against, with reasons: Rat Stack exports driver subpaths (`@rat-stack/database` has `./d1`, `./hyperdrive-postgres`) and Vitest publishes 14 role entries plus `./internal/*` ((pack: composition, evidence/FINDINGS.md) Cycles 001, 005). Both are published multi-runtime packages; a private library in this stack takes the four homes above instead.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```jsonc
// WRONG: packages/ledger/package.json
"exports": {
  ".": { "test": "./src/mod.testing.ts", "default": "./src/mod.ts" },
  "./testing": "./src/testing.ts",
  "./postgres": "./src/postgres-ledger.ts",
  "./workerd": "./src/ledger.workerd.ts",
  "./ledger.schema": "./src/ledger.schema.ts"
}

// RIGHT
"exports": {
  ".": {
    "workerd": { "@systemfsoftware/source": "./src/mod.workerd.ts", "default": "./dist/mod.workerd.js" },
    "@systemfsoftware/source": "./src/mod.ts",
    "default": "./dist/mod.js"
  }
}
// Ledger.layerTest is exported from "."; mod.workerd.ts exports the same names as mod.ts;
// the Postgres Layer lives in the application or in @scope/ledger-postgres.
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-entries` (`scripts/tools/repo-checks/composition.ts`, `checkCompositionEntries`) fails a private library with two keys resolving to one file. Known gate defect: the same check also fails a library that has an `internal` or `src/internal` folder and no `"./internal/*": null` (`composition.ts:335-336`), so today it fails the RIGHT map above whenever the library has an `internal` folder. The fix is in the gate, not in the manifest: replace that clause with the `.`-only fact below.

Judge-gated, `entries-are-roles`, same check: not authoritative until relabelled and re-recorded. A library with two or more entries is sent as compiler facts (keys, source targets, whether a key repeats its source path two folders deep) to a panel of two models (`~deepseek/deepseek-flash-latest`, `google/gemini-3.8-flash`, set by `REPO_CHECKS_JUDGE_MODELS`, `OPENROUTER_API_KEY` required). Its recorded kappa is 0.737 over 29 cases (`scripts/tools/repo-checks/calibration/kappas.json`), but its labels agree with the blind second rater at kappa 0.51 (`calibration/second-rater.jsonl` against `calibration/cases.jsonl`), and its rubric in `composition-judge.ts` still counts `./testing` and driver keys as legitimate roles, so today it would enforce the opposite of this rule. Known gate defect: `composition.ts` reads only the kappa, so a violated verdict from it can still fail the check; under this pack its verdicts are reports until its labels and rubric follow this rule and `composition-calibrate --record --write` re-records it.

Gate: none yet for "a private library has no key besides `.`". It would read, from `exportsMapOf` in `scripts/tools/repo-checks/package-exports.ts`, every key of a private library other than `.`, and fail each one that has no recorded justification (an asset or tool-config key is reported for review).

Gate: none yet for widening conditions. It would read, with the compiler, the exported names of the file each condition branch of `.` resolves to, and fail a branch whose names differ from the default branch's, and any branch whose condition is `test`, `vitest` or `development`.
