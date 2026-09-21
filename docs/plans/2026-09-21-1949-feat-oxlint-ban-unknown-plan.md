---
title: "feat(oxlint-plugin-cell-architecture): add ban-unknown rule with generic default exemption"
date: "2026-09-21"
type: "feature"
product_contract_source: "ce-plan-bootstrap"
---

# Problem Frame

TypeScript developers aiming for high boundary safety want to ban untyped `unknown` values across domain implementations (fields, function parameters, returns, type assertions). However, stock oxlint's `typescript/no-restricted-types` is purely syntactic and lacks positional awareness: configuring `"unknown": true` indiscriminately flags generic type parameter defaults such as `<A = unknown>` or `<in InElem = unknown>`.

In the TypeScript type lattice and throughout Effect-TS (158 instances across 29 files in `repos/effect/packages/effect/src`), `<A = unknown>` is the foundational idiom for unconstrained covariant and contravariant slots. A blanket ban without positional exemption breaks this idiom, while permitting `unknown` everywhere undermines type safety.

# Proposed Solution

Author a new oxlint JS rule `ban-unknown` in the existing `@systemfsoftware/oxlint-plugin-cell-architecture` package.

The rule visits `TSUnknownKeyword` nodes and selectively flags violations while allowing:

1. **Generic type parameter defaults**: where `node.parent?.type === "TSTypeParameter" && node.parent.default === node`.
2. **Type predicate input parameters**: where `node` is the type annotation of a parameter in a function returning a type predicate (`returnType.type === "TSTypePredicate"`), e.g. `(u: unknown): u is Target`.
3. **Catch clause bindings**: where `node` annotates a catch clause error binding, e.g. `try { ... } catch (e: unknown) { ... }`.

All other uses of `unknown` (record fields, function arguments, return types, type assertions, array elements, and un-defaulted constraints `<A extends unknown>`) are reported with an actionable diagnostic.

# Destructive Review Audit (skill://destructive-review)

### Phase 1: Assumptions Surfaced

1. **Assumption 1 (AST-Only Viability)**: Syntactic node checks (`node.parent?.type === "TSTypeParameter"`) are sufficient to distinguish benign generic defaults from malicious or accidental untyped slots without requiring a type-checker or symbol resolver.
2. **Assumption 2 (Plugin Boundary Fit)**: Banning untyped `unknown` belongs inside `oxlint-plugin-cell-architecture` rather than a separate package or a global compiler configuration.
3. **Assumption 3 (Predicate Completeness)**: Allowing `(u: unknown): u is T` and `<A = unknown>` covers all legitimate positions of `unknown` in modern Effect/TypeScript codebases.

### Phase 2: Mutation Lens

- **Selected**: **Scope Challenge** (rotated from Brevity).
- **Rationale**: The rule could either be too narrow (only covering bare `unknown` while missing `unknown[]` or `Record<string, unknown>`) or too broad (banning valid serialization boundaries).

### Phase 3: 3 Failures Under This Lens & Radical Alternative

1. **Failure 1 (Transitive unknown escapes)**: Banning only `TSUnknownKeyword` directly allows `unknown[]` (`TSArrayType`) or `Promise<unknown>` (`TSTypeReference`) unless the visitor checks if `unknown` appears anywhere inside those type annotations.
2. **Failure 2 (Imported / Type-fest aliases)**: If an author writes `type Any = unknown` with a single ignore comment, the rule would ban the alias declaration but allow `Any` everywhere else.
3. **Failure 3 (Exemption false positives)**: In `<A extends unknown = unknown>`, the constraint `<A extends unknown>` is redundant and sloppy, but the default `= unknown` is legitimate.

- **Radical Alternative**: Structure the visitor specifically on `TSUnknownKeyword` leaf nodes, inspect their immediate AST parent chain, and reject any `TSUnknownKeyword` unless its immediate parent is `TSTypeParameter.default` or a function parameter whose enclosing function's `returnType` is a `TSTypePredicate`.

# Test Layer Selection (skill://test-layer-selection)

- **Test Layer**: **Pure RuleTester Unit Tests** (`*.test.ts`).
- **Placement**: `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/__tests__/ban-unknown.test.ts`.
- **Permission Matrix**: Oxlint plugin rules are pure AST transform/visitor decision cells. They are tested in-process using `@oxlint/plugins-dev` `RuleTester` wired to Vitest.
- **In-Process Gate**: Pass. No child processes, CLI shells, or external daemons spawned. Runs 100% in-process within Vitest runner.
- **Mutation Gate**: Must achieve 100% mutation score on Stryker without surviving mutants.

# Key Technical Decisions

### KTD 1: Placement in `@systemfsoftware/oxlint-plugin-cell-architecture`

- **Choice**: Add `ban-unknown` to `packages/oxlint-plugin/oxlint-plugin-cell-architecture`.
- **Alternatives Considered**: New standalone package `@systemfsoftware/oxlint-plugin-type-discipline`.
- **Rationale**: `oxlint-plugin-cell-architecture` already hosts boundary and type discipline rules (`ban-classes`, `ban-error-string`, `no-context-generic-tag`). A standalone package would add unnecessary workspace overhead (tsdown, api-extractor, stryker setup, CI package matrix) for a single rule.

### KTD 2: Exemption Strategy

- **Choice**: Allow `<A = unknown>`, `(u: unknown): u is T`, and `catch (e: unknown)` by default.
- **Alternatives Considered**: Allow generic defaults only.
- **Rationale**: In TypeScript, type guards (`isX = (u: unknown): u is X`) literally require `unknown` as the unvalidated input type. Banning `unknown` in type guard parameters forces authors into `any` (violating `no-explicit-any`) or untyped parameters.

### KTD 3: Options Schema via Effect Schema

- **Choice**: Validate rule options with `effect/Schema` and generate JSON Schema via `JSONSchema.make` per project conventions (`skill://develop-oxlint-rules`).
- **Rationale**: Adheres to systemfsoftware rule authoring standards, providing compile-time type safety and runtime validation for oxlint config options without manual JSON schema duplication.

# Implementation Units

## Unit 1: Rule Definition and Configuration

- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/ban-unknown.config.ts`
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/ban-unknown.ts`
- **Details**:
  - Define `Options` schema using `Schema.Struct`:
    - `allowGenericDefault: Schema.optionalWith(Schema.Boolean, { default: () => true })`
    - `allowTypePredicate: Schema.optionalWith(Schema.Boolean, { default: () => true })`
    - `allowCatchClause: Schema.optionalWith(Schema.Boolean, { default: () => true })`
  - Export `meta` with `type: 'problem'` and descriptive diagnostic message (`Do not use 'unknown' as a type. Use a specific domain schema, branded type, or generic parameter`).
  - Implement visitor for `TSUnknownKeyword`:
    - Check if parent is `TSTypeParameter` and `parent.default === node` -> ignore if `allowGenericDefault`.
    - Check if parent is parameter of a function with `TSTypePredicate` return type -> ignore if `allowTypePredicate`.
    - Check if parent is `CatchClause` -> ignore if `allowCatchClause`.
    - Otherwise report violation with `messageId: 'banned'`.

## Unit 2: Plugin Registration and Export

- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/index.ts`
- **Details**:
  - Register `ban-unknown` in `oxlint-plugin-cell-architecture` rules record.
  - Export rule types and include in plugin metadata.

## Unit 3: Test Suite via RuleTester

- **Files**:
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/__tests__/ban-unknown.test.ts`
- **Details**:
  - Wire `RuleTester` to Vitest (`RuleTester.it = it`, `RuleTester.describe = describe`).
  - Test valid cases:
    - `interface Box<A = unknown> {}`
    - `type Alias<A = unknown> = { v: A }`
    - `const isFoo = (u: unknown): u is Foo => true`
    - `function check(input: unknown): input is Bar { return true }`
    - `try {} catch (err: unknown) {}`
  - Test invalid cases:
    - Plain field: `{ v: unknown }`
    - Function param: `function f(x: unknown): void {}`
    - Function return: `function f(): unknown {}`
    - Type assertion: `x as unknown as Y`
    - Array shorthand: `unknown[]` or `Array<unknown>`
    - Bare constraint: `<A extends unknown>`

# Verification Plan

```bash
# 1. Run unit test suite
pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test

# 2. Run package build and API surface verification
pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture build

# 3. Full monorepo verification gate
pnpm check:local
```
