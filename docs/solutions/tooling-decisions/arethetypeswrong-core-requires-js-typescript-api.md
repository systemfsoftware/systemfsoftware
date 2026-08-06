---
title: arethetypeswrong core runs the typescript 6 JS bridge, not typescript 7
date: "2026-08-05"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Bumping typescript to a new major version in this monorepo
  - Evaluating whether @systemfsoftware/arethetypeswrong-core can move to typescript 7
  - Dependabot proposes a typescript major-version update
root_cause: external_breaking_change
resolution_type: version_pin
related_components:
  - packages/arethetypeswrong/core
  - pnpm-workspace.yaml
  - .github/dependabot.yml
  - packages/stryker-js/typescript-checker
tags:
  - typescript
  - tsgo
  - dependabot
  - module-resolution
  - arethetypeswrong
  - tooling
---

# arethetypeswrong core runs the typescript 6 JS bridge, not typescript 7

## Context

The monorepo moved to TypeScript 7 (native Go compiler, catalog `typescript: ^7`, `typescript@7.0.2` installed, Effect Language Service patched in via `effect-tsgo patch`). Every workspace package builds, typechecks, and tests on 7.0.2 — except `@systemfsoftware/arethetypeswrong-core`, which runs the **typescript@6 JS bridge** (`catalog:attw`, `^6.0.3`, resolves 6.0.3).

The 6.x line is the last TypeScript release with the full JS compiler API. `typescript@7` is the native compiler package: its main export is `./lib/version.cjs` (version strings only), and its `unstable/*` exports are an LSP-style snapshot client (`API`/`Snapshot`/`Project`/`Program`/`Checker`) with no `createProgram`, no `resolveModuleName`, no `CompilerHost`, no module-resolution caches, and no resolution traces. attw core's analysis engine (`src/internal/multiCompilerHost.ts`, `getEntrypointInfo.ts`) is built on exactly those internals — `getTemporaryModuleResolutionState`, `getPackageScopeForPath`, `createModeAwareCache`, `changesAffectModuleResolution` — several only reachable via `ts-expose-internals`, which tops out at 5.6.3 (no 6.x exists; its type augmentation typechecks cleanly against 6.0.3, verified by the core's `tsc --noEmit`).

The migration 5.9.3 → 6.0.3 was verified end to end: typecheck clean, 58/58 tests pass, and the only snapshot churn is the compiler-version string that resolution traces embed (`moment@2.29.1`, `react@18.2.0`). A 7.x bump (dependabot PR #36) breaks the build: typecheck errors against the 7.x d.ts surface and a runtime crash on `ts.createProgram` being `undefined`. PR #36 was closed as superseded; the dependabot ignore below prevents recurrence.

## Guidance

- **The 6.x bridge is the ceiling, not staleness.** Do not bump `packages/arethetypeswrong/core`'s `typescript` to 7.x. The checks this package produces are resolution-behavior reports, and only the JS compiler reproduces its own resolution semantics — upstream `arethetypeswrong` pins `typescript@5.6.1-rc` exactly for the same fidelity reason.
- **Two catalogs, one dependency, two majors:** the default catalog carries `typescript: ^7` for the toolchain; the named `attw` catalog carries `^6.0.3` for attw core (referenced as `catalog:attw`). This follows the monorepo's named-catalog convention for distinct dependency axes (see `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`).
- **Detect the constraint cheaply:** `node -e "console.log(Object.keys(require('typescript')))"` — on 7.x this prints only `version,versionMajorMinor`; on 6.x/5.x it prints the full compiler API. A tsgo migration is possible only when the `unstable/*` API gains a resolution surface (resolution results, traces, per-mode behavior) — none exists today.
- **Dependabot guard:** `.github/dependabot.yml` carries `ignore: [{ dependency-name: "typescript", update-types: ["version-update:semver-major"] }]` on the npm entry. Do not remove it to "let dependabot decide" — typescript majors are manual migrations (the catalog `^7` bump was itself a manual edit). Minor/patch updates still flow through the `typescript-minor-patch` group and update the `attw` catalog entry via dependabot's catalog support.
- **Verification on bump day:** after any future deliberate typescript major migration, run `pnpm turbo typecheck --force` (bypasses turbo cache) and `pnpm check`, re-run the import audit (`grep -rnE "from 'typescript'|require\('typescript'\)|import\('typescript'\)" packages omp scripts`), and re-check the attw snapshot fixtures — resolution traces embed the compiler version string, so snapshot regeneration is expected when the compiler line moves.

## Related

- `packages/arethetypeswrong/core/README.md` — normative statement of the pin
- `pnpm-workspace.yaml` — the `attw` catalog entry
- `.github/dependabot.yml` — the ignore rule
- Upstream pin: `arethetypeswrong.github.io` core `"typescript": "5.6.1-rc"`
- `docs/plans/2026-08-05-001-fully-on-typescript-7-plan.md` — the migration plan that landed this decision
