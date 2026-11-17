---
title: Schema discovery by syntax skipped schemas whose type was only inferred
date: "2026-11-17"
category: logic-errors
module: effect-schema-discovery
problem_type: logic_error
component: testing_framework
symptoms:
  - "An exported `Schema.declareConstructor<T>()(typeParameters, run)` with no type annotation earned no codec laws"
  - "Adding an explicit `Schema.Codec<...>` annotation to the same export made the laws appear"
  - "A schema built by a local helper function (`export const X = boxOf(Schema.String)`) was skipped the same way"
  - "No error: a missed schema is silently absent from the generated law suite"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - packages/schema/effect-schema-discovery
  - packages/schema/effect-schema-vite
tags:
  - effect-schema
  - discovery
  - typescript-api
  - assignability
  - law-generation
---

# Schema discovery by syntax skipped schemas whose type was only inferred

## Problem

`findExportedSchemas` decided whether an export is a schema from its source text alone: a type annotation whose name contains `Schema`, or an initializer that is a call on a member chain rooted at `S` or a name containing `Schema`. A curried call such as `Schema.declareConstructor<T>()(...)` has a call as its callee, so the initializer test returned false; a helper-built schema has a callee that names nothing. Both exports were skipped, and a skipped schema leaves no trace in the generated suite.

## Root cause

Being a schema is a property of an export's type, not of how its initializer is spelled. Any syntactic rule only enumerates spellings, and each new constructor shape is a silent miss.

## Fix

A semantic pass now decides the exports the syntactic pass rejects (`src/internal/schema-assignability.ts`). The syntactic pass is kept unchanged, so everything found before is still found, and fixture modules that never import `effect` keep their results. The semantic pass:

- opens the modules through TypeScript 7's `typescript/unstable/sync` API with `updateSnapshot({ openFiles })`, so each module gets the project its own tsconfig (or an inferred project) gives it, solution-style tsconfigs included;
- serves each module through the API's virtual `fs.readFile` with `export type <alias> = import('effect/Schema').Top` appended, so `Schema.Top` resolves with exactly the module resolution the module's own imports use, in the same checker;
- accepts an export when `checker.isTypeAssignableTo(type, top)`, unless the schema decodes to an `Error` (below).

Regression coverage is the scenario "A schema whose type is only inferred earns a law pair, however its initializer is spelled" in `packages/schema/effect-schema-vite/tests/inline-schema-tests.integration.test.ts`; it fails on the syntactic-only code.

## Gotchas measured while fixing it

- An `import('effect/Schema')` that does not resolve gives `Top` the `any` type, and every type is assignable to `any`: in a temp package without `effect`, a plain function export was accepted as a schema. The pass therefore uses `Top` only when it is an object type. Removing that guard fails the existing "package that exports no schemas" scenario.
- An export typed `any` or `never` is assignable to `Top` vacuously; the pass rejects both. Removing that check fails the inference scenario on its `Untyped: any` export.
- The syntactic pass excludes tagged errors on purpose: an error is a failure value, not a codec. `Schema.TaggedErrorClass` classes are not assignable to `Schema.Top`, but `Schema.TaggedError` classes are, so a first version of the semantic pass generated laws for one in a package whose suite had been empty, and that suite then failed to import the law package it never needed. The pass now also appends `import('effect/Schema').Codec<Error, unknown, unknown, unknown>` and drops any export assignable to it. Removing that check fails the inference scenario on its `Rejected` export.
- `typescript` 7.1 development builds export the API as `typescript/sync`, and `typescript/unstable/sync` is gone, so the package pins `typescript` to `~7.0.2` through its own `typescript-api` catalog entry; a caret range would resolve 7.1 and fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Run before and after over every package `src` in this repository (25 packages, 122 exports found before): nothing lost and nothing added, so in-repo law suites are unchanged.
- Opening a one- or two-module project and checking its exports took 30 to 150 ms across five local runs.

## Alternatives rejected

- Teaching the syntactic pass to unwrap curried calls: it fixes one spelling and still misses helper-built schemas.
- Taking `Top` from the program file whose path ends in `effect/dist/Schema.d.ts`: it decides by path, and breaks when `effect` resolves to source or changes layout.
- Taking `Top` from the module that declares an export's own type symbol: a class export's type is declared in the user's module, and any module exporting a `Top` would be trusted.
- Replacing the syntactic pass entirely: existing fixtures use `Schema` without importing `effect`, and their results would change.
