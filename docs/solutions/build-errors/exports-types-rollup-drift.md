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
fix_prs: [899cfacb4, 684aeac6d, ef6a990f5, cd364e5, fe838ca]
---

# exports.types points to api-extractor rollup that build never produces

## Problem

`package.json#exports.types` declared `./dist/<name>.d.ts` (the api-extractor rollup output — a build artifact under each `packages/*/dist/`), but the `build` script was `tsdown` only. api-extractor was only invoked from the `api:check` script, never during the release job's fresh `pnpm build`. Result: the npm tarball shipped `dist/index.d.ts` (tsdown's output) plus whatever happened to be in `dist/` at the moment of publish, but never the api-extractor rollup `.d.ts` that `exports.types` referenced.

Downstream consumers who ran `attw --pack` on the published tarball saw `No types` / `FallbackCondition` errors. `pnpm install` resolved the broken `types` path by falling back to the `.mjs` default — silently producing type-less resolutions for the entire surface.

## Symptoms

- `attw --pack .` reports `❌ No types / Used fallback condition` for the affected subpath (node16/CJS, node16/ESM, bundler columns). node10 stays green because its resolution algorithm doesn't walk conditional exports the same way.
- The error appears only against the _published_ tarball. In the workspace, `dist/<name>.d.ts` exists from earlier `api:check` runs, masking the problem locally.
- `pnpm check` exits 0.
- The published package's tarball lacks the api-extractor rollup file (verified by `curl tarball | tar tzf -`).

## What Didn't Work

- **Overriding the resolver's conditions so TypeScript picks a specific `.d.ts`.** `"types"` is not a Node conditional-exports condition; the override merely happened to find the file for unrelated reasons, and an unrelated reviewer flagged it as a hack.
- **Adding `bundledPackages` to api-extractor config without changing build.** `bundledPackages` controls the _rollup output_ — it inlines dependency types into the rollup `.d.ts` so consumers don't need to install those deps. It does NOT cause the rollup file to be produced; that's still a build-script concern.
- **Running api-extractor only from the `api:check` task and trusting CI to catch it.** Build output does not persist between workflow jobs, so the job that writes `dist/<name>.d.ts` is not the job that builds the tarball. The fix makes `build` produce the rollup itself.

## Solution

Three coordinated changes:

**1. Wire api-extractor into the `build` script for every package that has an api-extractor config and an `exports.types` pointing at the rollup filename.**

```json
// packages/effect-schema-extensions/package.json
"build": "tsdown && pnpm api:check" // api:check: api-extractor run [--config api-extractor.hex-schema.json]

// packages/effect-schema-law/package.json
"build": "tsdown && pnpm api:check"

// packages/hex-schema/package.json
"build": "tsdown && pnpm api:check"
```

`api-extractor run` (the `api:check` script, invoked by `build`) writes the rollup to `dist/<name>.d.ts` (per `dtsRollup.untrimmedFilePath`) and validates `etc/<name>.api.md` against it; the `api:update` script adds `--local` to rewrite the report in place rather than fail when it changes.

**2. Make the api-extractor tsconfig extend the base shared tsconfig (`@systemfsoftware/tsconfig/tsc/dom/library-monorepo`) directly**, not the package's `tsconfig.json`. Extending the package config pulls the workspace's TypeScript sources into the programme, which api-extractor rejects with `ae-wrong-input-file-type`. Extending the base follows standard Node resolution across each package's `exports` map: the `.mjs` `default` export, then the sibling `.d.ts` (the api-extractor rollup output) auto-located beside it.

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
2. `api-extractor run` (through the package's `api:check` script, invoked by `build`) reads `dist/index.d.ts`, follows re-exports, inlines types from bundled packages, writes `dist/effect-schema-extensions.d.ts`.
3. `package.json#exports.types` → `dist/effect-schema-extensions.d.ts` (the inlined rollup, not the barrel).
4. Consumer install → `attw --pack` → green.

The "what didn't work" attempts each addressed one part of the chain but missed that **api-extractor must run during `build`, not just during CI's static-analysis pass.** `api:check` validates the API report; `build` produces the shipped artifact. They are not the same step, and conflating them means the artifact drifts from the report.

## Prevention

- **Wire api-extractor into `build`** for any package whose `exports.types` references a path that the api-extractor `dtsRollup.untrimmedFilePath` controls. Make `build` produce every file that `exports.*` claims.
- **Verify with `attw --pack .` against a clean `dist/`** — delete `dist/`, run only the package's `build` script, then `attw --pack .`. If attw reports missing types, the build script isn't producing what `exports.types` claims. This is the single check that catches the bug class.
- **Don't coerce TypeScript's resolver with non-standard conditions** to make it pick a specific `.d.ts`. The legitimate solutions are: bundle the dep (`bundledPackages`), extend a base tsconfig whose resolution reaches the built entry, or change the dep's exports so the standard conditions find the types.
- **Treat `dist/<name>.d.ts` (api-extractor rollup) and `dist/index.d.ts` (tsdown output) as distinct artifacts with different purposes.** The rollup is for `exports.types`. The index is the runtime type companion to the JS barrel. Don't conflate them or merge the configs.

## Related Issues

- **Found by:** running `attw --pack` on `effect-schema-extensions@0.4.0` (npm-published). The user's install reported missing types.
- **Same bug across multiple packages:** `effect-schema-extensions`, `effect-schema-law`, and `hex-schema` all had `exports.types` pointing at files their `build` script never produced. Fixed in the same PR series.
- **AGENTS.md safety rule REPO-S4** ("never hand-edit `package.json#exports` on tsdown packages") covers how exports get generated but not how they stay in sync with what `build` produces. Worth extending.
