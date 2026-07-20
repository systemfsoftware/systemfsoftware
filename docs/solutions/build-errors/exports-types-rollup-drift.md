---
title: "package.json exports.types points to api-extractor rollup that build never produces"
date: 2026-07-20
category: build-errors
module: npm-package
problem_type: build_error
component: tooling
symptoms:
  - "attw reports WrongExportType errors for the published package"
  - "TypeScript consumers see FallbackCondition errors when resolving types"
  - "attw --pack . exits non-zero with \"No problems found\" being replaced by missing-type flags"
  - "pnpm check passes locally but consumers fail on npm install"
root_cause: config_error
resolution_type: config_change
severity: high
tags:
  - package-json
  - exports-types
  - api-extractor
  - rollup
  - npm-tarball
  - attw
  - tsdown
  - check-exports
fix_prs: [899cfacb4, 684aeac6d, ef6a990f5, cd364e5, fe838ca]
---

# exports.types points to api-extractor rollup that build never produces

## Problem

`package.json#exports.types` declared `./dist/<name>.d.ts` (the api-extractor rollup output — a build artifact under each `packages/*/dist/`), but the `build` script was `tsdown` only. api-extractor was only invoked from the `api:check` script in CI — never during the release job that ran `pnpm build && semantic-release`. Result: the npm tarball shipped `dist/index.d.ts` (tsdown's output) plus whatever happened to be in `dist/` at the moment of publish, but never the api-extractor rollup `.d.ts` that `exports.types` referenced.

Downstream consumers who ran `attw --pack` on the published tarball saw `No types` / `FallbackCondition` errors. `pnpm install` resolved the broken `types` path by falling back to the `.mjs` default — silently producing type-less resolutions for the entire surface.

## Symptoms

- `attw --pack .` reports `❌ No types / Used fallback condition` for the affected subpath (node16/CJS, node16/ESM, bundler columns). node10 stays green because its resolution algorithm doesn't walk conditional exports the same way.
- The error appears only against the _published_ tarball. In the workspace, `dist/<name>.d.ts` exists from earlier `api:check` runs, masking the problem locally.
- `pnpm check` exits 0. The repo has no step that validates "what we ship is what consumers see" — only `check:exports` does, and it's not in the `pnpm check` pipeline.
- The published package's tarball lacks the api-extractor rollup file (verified by `curl tarball | tar tzf -`).

## What Didn't Work

- **Adding `customConditions: ["types"]` to the api-extractor tsconfig.** `"types"` is not a Node conditional-exports condition. It happened to work because TypeScript picked up the `.d.ts` for unrelated reasons, but the override was a hack that an unrelated reviewer flagged.
- **Adding `bundledPackages` to api-extractor config without changing build.** `bundledPackages` controls the _rollup output_ — it inlines dependency types into the rollup `.d.ts` so consumers don't need to install those deps. It does NOT cause the rollup file to be produced; that's still a build-script concern.
- **Running api-extractor only in `api:check` and trusting CI to catch it.** CI runs `pnpm check` which does include `api:check`, but `api:check`'s side-effect (writing `dist/<name>.d.ts`) doesn't persist across the workflow's two jobs. The `release` job runs `pnpm build` fresh, and that job doesn't invoke api-extractor.

## Solution

Three coordinated changes:

**1. Wire api-extractor into the `build` script for every package that has an api-extractor config and an `exports.types` pointing at the rollup filename.**

```json
// packages/effect-schema-extensions/package.json
"build": "tsdown && api-extractor run --local && api-extractor run --local --config api-extractor.hex-schema.json"

// packages/effect-schema-law/package.json
"build": "tsdown && api-extractor run --local"

// packages/hex-schema/package.json
"build": "tsdown && api-extractor run --local"
```

`api-extractor run --local` writes the rollup to `dist/<name>.d.ts` (per `dtsRollup.untrimmedFilePath`) and updates `etc/<name>.api.md`. The `--local` flag means "update the .api.md in place" rather than failing when it changes.

**2. Make the api-extractor tsconfig extend the base shared tsconfig (`@systemfsoftware/tsconfig/tsc/dom/library-monorepo`) directly**, not the package's `tsconfig.json`. The package tsconfig has `customConditions: ["@systemfsoftware/source"]` which makes TypeScript resolve workspace deps to their source `.ts` files — api-extractor rejects these with `ae-wrong-input-file-type`. Extending the base skips that condition; standard Node resolution finds the `.mjs` `default` export, then auto-locates the sibling `.d.ts` (the api-extractor rollup output).

```json
// packages/effect-schema-extensions/tsconfig.api.json
{
  "extends": "@systemfsoftware/tsconfig/tsc/dom/library-monorepo",
  "include": ["dist/index.d.ts"]
}
```

3. `package.json#exports.types` → `dist/effect-schema-extensions.d.ts` (the inlined rollup, not the barrel — this file is build output, present at publish time after the fix).

## Why This Works

**The api-extractor `.d.ts` rollup IS the published type definition.** It inlines (via `bundledPackages`) the types of any workspace dependencies and outputs a single self-contained `.d.ts` at `dtsRollup.untrimmedFilePath`. `exports.types` points at this file, so consumers get a complete type surface without following the `export *` chain.

The chain to make this work:

1. `tsdown` produces `dist/index.mjs` and `dist/index.d.ts` (the source barrel — `export * from '@systemfsoftware/hex-schema'`; both files are build output under each `packages/*/dist/`).
2. `api-extractor run --local` reads `dist/index.d.ts`, follows re-exports, inlines types from bundled packages, writes `dist/effect-schema-extensions.d.ts`.
3. `package.json#exports.types` → `dist/effect-schema-extensions.d.ts` (the inlined rollup, not the barrel).
4. Consumer install → `attw --pack` → green.

The "what didn't work" attempts each addressed one part of the chain but missed that **api-extractor must run during `build`, not just during CI's static-analysis pass.** `api:check` validates the API report; `build` produces the shipped artifact. They are not the same step, and conflating them means the artifact drifts from the report.

## Prevention

- **Wire api-extractor into `build`** for any package whose `exports.types` references a path that the api-extractor `dtsRollup.untrimmedFilePath` controls. Check `scripts/check-exports.mjs` — it already enforces this contract (CHECK 3: api-extractor rollup coverage). Make `build` produce every file that `exports.*` claims.
- **Run `pnpm check:exports` in CI** alongside `pnpm check`. It validates the live `dist/` against `package.json#exports` — drift between the two fails the check. Add it to `.github/workflows/reusable-checks.yml` if it's not already wired in.
- **Verify with `attw --pack .` against a clean `dist/`** — delete `dist/`, run only the package's `build` script, then `attw --pack .`. If attw reports missing types, the build script isn't producing what `exports.types` claims. This is the single check that catches the bug class.
- **Don't override `customConditions` with non-standard values** to coerce TypeScript into resolving a specific `.d.ts`. The legitimate solutions are: bundle the dep (`bundledPackages`), drop the offending condition by extending a different base tsconfig, or change the dep's exports so the standard conditions find the types.
- **Treat `dist/<name>.d.ts` (api-extractor rollup) and `dist/index.d.ts` (tsdown output) as distinct artifacts with different purposes.** The rollup is for `exports.types`. The index is the runtime type companion to the JS barrel. Don't conflate them or merge the configs.

## Related Issues

- **Found by:** running `attw --pack` on `effect-schema-extensions@0.4.0` (npm-published). The user's install reported missing types.
- **Same bug across multiple packages:** `effect-schema-extensions`, `effect-schema-law`, and `hex-schema` all had `exports.types` pointing at files their `build` script never produced. Fixed in the same PR series.
- **Discovery script:** `scripts/check-exports.mjs` has the right checks but wasn't wired into `pnpm check` as a blocking step.
- **AGENTS.md safety rule S4** ("never hand-edit `package.json#exports` on tsdown packages") covers how exports get generated but not how they stay in sync with what `build` produces. Worth extending.
