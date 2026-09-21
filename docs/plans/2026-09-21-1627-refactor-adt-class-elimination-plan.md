---
title: "refactor: Eliminate bare classes, prune dead rules, and activate test-discipline and ban-classes rules"
type: refactor
date: 2026-09-21
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

- **Objective**: The codebase contains zero unsanctioned bare classes, prunes dead oxlint rules, and activates test discipline and class restrictions across all packages, enforcing these invariants permanently in CI.
- **Means**: Delete dead rules (`no-barrels`, `no-inline-destructured-type`), activate `no-pseudo-gherkin-unit-tests` in `oxlint-plugin-test-discipline` and `no-bodyless-status-assertion` in `oxlint-plugin-cell-architecture` (or `test-discipline`), refactor `npm-package` and `effect-atom` to Effect-idiomatic ADTs (KTD1, KTD2), and enforce `ban-classes` at `error` (KTD3).
- **Authority hierarchy**:
  - `CONSTITUTION.md` & `CONCEPTS.md` (Pure core, nominal TypeId identity, functional dispatch)
  - Architectural policy (Sanctioned Effect v4 idioms; bare classes forbidden)
  - This plan
- **Stop conditions**:
  - `pnpm check:local` runs clean across all 32 workspace packages with zero lint suppressions or disable comments.
  - All unit and integration test suites pass without regression.
  - Public method interfaces on exported handles in `effect-atom` and `npm-package` remain backward-compatible for consumers.

---

## Product Contract

### Summary

1. Prune dead orphaned rules (`no-barrels` and `no-inline-destructured-type`).
2. Activate valuable assertion/testing rules: `no-pseudo-gherkin-unit-tests` in `@systemfsoftware/oxlint-plugin-test-discipline` and `no-bodyless-status-assertion` in `@systemfsoftware/oxlint-plugin-cell-architecture`.
3. Transition remaining bare class implementations (`Package` in `@systemfsoftware/npm-package`, `NodeImpl`, `RegistryImpl`, and ref handles in `@systemfsoftware/effect-atom`) to Effect-native ADT models with nominal `TypeId` branding and prototype-backed instances.
4. Activate `ban-classes` in `@systemfsoftware/oxlint-plugin-cell-architecture`'s recommended config and the root recommended preset.

### Problem Frame

Oxlint configuration was carrying 5 orphaned rules that were never executed. Two of them (`no-barrels` and `no-inline-destructured-type`) are obsolete or fire on correct code and should be removed. Two of them (`no-pseudo-gherkin-unit-tests` and `no-bodyless-status-assertion`) enforce valuable testing and assertion discipline. The final rule, `ban-classes`, prevents AI agents from introducing classical object-oriented hierarchies into pure functional Effect codebases, but was blocked by legacy bare classes in `effect-atom` and `npm-package`.

### Requirements

- **R1**: Delete `no-barrels` and `no-inline-destructured-type` from `@systemfsoftware/oxlint-plugin-cell-architecture` (source, configs, and tests).
- **R2**: Activate `no-bodyless-status-assertion` in `@systemfsoftware/oxlint-plugin-cell-architecture` (or `@systemfsoftware/oxlint-plugin-test-discipline`) `configs.recommended` at `error`.
- **R3**: Activate `no-pseudo-gherkin-unit-tests` in `@systemfsoftware/oxlint-plugin-test-discipline` `configs.recommended` at `error`.
- **R4**: Refactor `@systemfsoftware/npm-package` to model `Package` as an Effect-idiomatic ADT featuring a unique nominal `TypeId`, an `interface Package`, a shared prototype, and standalone/dual functions (`make`, `tryReadFile`, `readFile`, `withOverlay`).
- **R5**: Refactor `@systemfsoftware/effect-atom` to eliminate the `class` keyword from all internal node and registry definitions (`NodeImpl`, `WriteContextImpl`, `RegistryImpl`, `ReadonlyRefImpl`, `MapRefImpl`, `PropRefImpl`) using nominal `TypeId` symbols and prototype inheritance (`Object.create(Proto)`), preserving exact memory characteristics and method dispatch.
- **R6**: Enforce `ban-classes` at `error` in `configs.recommended` in `@systemfsoftware/oxlint-plugin-cell-architecture`, reporting any class that does not extend a constructor or that extends `Object`/`Function`, routing to sanctioned Effect v4 idioms.
- **R7**: `pnpm check:local` must exit 0 across all 32 workspace packages.

### Key Decisions

- **KD1: Prune Obsolete Rules**: Permanently remove `no-barrels` and `no-inline-destructured-type` rather than leaving dead files in the tree. _(Governs R1)_
- **KD2: Activate Test Discipline Rules**: Include `no-pseudo-gherkin-unit-tests` and `no-bodyless-status-assertion` in `recommendedRules` of their respective plugins. _(Governs R2, R3)_
- **KD3: Nominal ADT Prototype Pattern over Classes**: Replace `class Foo { ... }` with `interface Foo { readonly [TypeId]: TypeId }` + `const FooProto = { ... }` + `makeFoo(...) => Object.create(FooProto)`. _(Governs R4, R5)_
- **KD4: Enforce Bare-Class Ban in Recommended Preset**: Ship `ban-classes` at `error` in `oxlint-config-cell-architecture` and `oxlint-config-recommended`. _(Governs R6, R7)_

---

## Planning Contract

### Key Technical Decisions

- **KTD1**: Delete `no-barrels.*` and `no-inline-destructured-type.*` and update `oxlint-plugin-cell-architecture` API surface.
- **KTD2**: In `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/index.ts`, add `no-pseudo-gherkin-unit-tests` to `recommendedRules`.
- **KTD3**: In `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/index.ts`, add `no-bodyless-status-assertion` and `ban-classes` to `recommendedRules`.
- **KTD4**: In `npm-package`, export `TypeId` symbol, `interface Package extends Pipeable, Inspectable`, and an `Object.create(PackageProto)` factory, retaining callable/constructor compatibility.
- **KTD5**: In `effect-atom`, convert `NodeImpl`, `WriteContextImpl`, `RegistryImpl`, `ReadonlyRefImpl`, `MapRefImpl`, and `PropRefImpl` into prototype-backed constructor functions or factory closures using `Object.create(Proto)`.
- **KTD6**: Run `api:update` on all affected packages and verify workspace gates via `pnpm check:local`.

---

## Implementation Units

### U1. Delete `no-barrels` and `no-inline-destructured-type`

- **Goal**: Remove dead rule files from `oxlint-plugin-cell-architecture`.
- **Requirements**: R1
- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/no-barrels.*`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/no-inline-destructured-type.*`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/index.ts`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/README.md`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/etc/oxlint-plugin-cell-architecture.api.md`
- **Verification**: `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test build` passes.

### U2. Activate `no-bodyless-status-assertion` & `no-pseudo-gherkin-unit-tests`

- **Goal**: Enroll both rules into their respective plugins' `configs.recommended`.
- **Requirements**: R2, R3
- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/index.ts`
  - `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/index.ts`
- **Approach**:
  1. Add `[rule('no-bodyless-status-assertion')]: 'error'` to `recommendedRules` in `oxlint-plugin-cell-architecture/src/index.ts`.
  2. Add `[rule('no-pseudo-gherkin-unit-tests')]: 'error'` to `recommendedRules` in `oxlint-plugin-test-discipline/src/index.ts`.
  3. Rebuild and update API signatures if necessary.
- **Verification**: `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline test` and `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test` pass.

### U3. Refactor `@systemfsoftware/npm-package` to ADT Model

- **Goal**: Eliminate `class Package` in `packages/npm-package/src/Package.ts`, replacing it with an Effect-style ADT (`TypeId`, interface, prototype, factory).
- **Requirements**: R4
- **Files**:
  - `packages/npm-package/src/Package.ts`
  - `packages/npm-package/etc/npm-package.api.md`
- **Approach**:
  1. Define `export const TypeId: unique symbol = Symbol.for('@systemfsoftware/npm-package/Package')`.
  2. Declare `export interface Package extends Pipeable, Inspectable`.
  3. Define `PackageProto` containing `tryReadBytes`, `tryReadFile`, `readFile`, `fileExists`, `directoryExists`, `listFiles`, `withOverlay`, `pipe`, `toJSON`, `toString`, `[NodeInspectSymbol]`.
  4. Create factory function `export const makePackage = (...) => Object.create(PackageProto)`.
  5. Provide `export const Package` callable/constructor compatibility.
  6. Rebuild and run `api:update`.
- **Verification**: `pnpm --filter @systemfsoftware/npm-package test typecheck build` passes.

### U4. Refactor `@systemfsoftware/effect-atom` Classes to Prototype ADTs

- **Goal**: Replace bare classes in `effect-atom` (`NodeImpl`, `WriteContextImpl`, `RegistryImpl`, `ReadonlyRefImpl`, `MapRefImpl`, `PropRefImpl`) with prototype-linked objects.
- **Requirements**: R5
- **Files**:
  - `packages/atom/effect-atom/src/AtomNode.ts`
  - `packages/atom/effect-atom/src/Registry.ts`
  - `packages/atom/effect-atom/src/AtomRef.ts`
  - `packages/atom/effect-atom/src/Result.ts`
  - `packages/atom/effect-atom/etc/*.api.md`
- **Approach**:
  1. In `AtomNode.ts`: Define `NodeImpl` interface and `NodeProto`. Replace `class NodeImpl` with constructor/factory linking `NodeProto`. Replace `class WriteContextImpl` with `WriteContextProto` + factory.
  2. In `Registry.ts`: Replace `class RegistryImpl` with `RegistryProto` implementing all methods of `Registry`, and a constructor function initializing state fields and linking to `RegistryProto`.
  3. In `AtomRef.ts`: Replace `class ReadonlyRefImpl`, `class MapRefImpl`, `class PropRefImpl` with prototype-linked constructor functions.
  4. In `Result.ts`: Replace `class BuilderImpl` with `BuilderProto` + factory.
  5. Run `pnpm --filter @systemfsoftware/effect-atom test build` and update API docs via `api:update`.
- **Verification**: `pnpm --filter @systemfsoftware/effect-atom test typecheck build` passes.

### U5. Activate `ban-classes` in Recommended Presets & Clean Local Gates

- **Goal**: Enable `ban-classes` in `@systemfsoftware/oxlint-plugin-cell-architecture`'s recommended config and ensure all packages pass without exemptions.
- **Requirements**: R6, R7
- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/index.ts`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/ban-classes.ts`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/README.md`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/etc/oxlint-plugin-cell-architecture.api.md`
  - `packages/oxlint-presets/oxlint-config-cell-architecture/src/index.ts`
- **Approach**:
  1. Add `[rule('ban-classes')]: 'error'` to `recommendedRules` in `oxlint-plugin-cell-architecture/src/index.ts`.
  2. Update `ban-classes.ts` to enforce bare-class / `extends Object` / `extends Function` bans with clear routing diagnostics.
  3. Rebuild preset packages: `oxlint-config-cell-architecture`, `oxlint-config-recommended`.
  4. Run `pnpm check:local` across all packages.
- **Verification**: `pnpm check:local` exits 0.

### U6. Changeset and Final Verification Gate

- **Goal**: Record changelog intents for the affected packages and verify clean git status.
- **Requirements**: R7
- **Files**:
  - `.changeset/*.md`
- **Verification**: `pnpm exec commitlint` and `pnpm check:local` pass.

---

## Verification Contract

```bash
# Verify formatting
./bin/dprint check

# Run full multi-package task matrix (lint, lint:tsgo, typecheck, test, attw, api:check)
pnpm check:local

# Verify build outputs
turbo build
```

---

## Definition of Done

- `no-barrels` and `no-inline-destructured-type` are deleted.
- `no-bodyless-status-assertion` and `no-pseudo-gherkin-unit-tests` are enabled in `recommendedRules`.
- Zero bare classes remain in `packages/npm-package` or `packages/atom/effect-atom`.
- `ban-classes` is active in `recommended` rules in `@systemfsoftware/oxlint-plugin-cell-architecture`.
- No package in the repository disables `ban-classes`.
- All 152 turbo tasks in `pnpm check:local` succeed without warnings or errors.
