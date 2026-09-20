---
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
title: "Cross-Field Invariants and Constructive Generation Alignment - Plan"
date: "2026-09-20"
type: "fix"
topic: "schema-filter-constructive-generation-cross-field"
execution: code
---

# Goal Capsule

## Objective

Authors of cross-field schema invariants get a lint gate whose demands match what Effect v4's arbitrary compiler actually reads: honest residual filtering is recognized as a declared choice for dense predicates, sparse predicates are pushed toward `Schema.declare`, and no message or silencer prescribes metadata the engine never consumes.

## Means

Receiver-kind-aware verdicts in `schema-filter-constructive-generation`, backed by an architecture doc that records the residual/declare doctrine (KTD1, KTD3).

## Boundaries

- In scope: rule logic and message catalog in `@systemfsoftware/oxlint-plugin-effect-schema`, its test suite, README/api surface, a changeset, and a solution doc with a glossary entry.
- Out of scope: upstream modifications to Effect core runtime (`repos/`), rewriting unrelated scalar filter rules, or modifying test runners.

---

# Product Contract

_Product Contract unchanged._

## Summary

The workspace will update `schema-filter-constructive-generation` to distinguish between scalar filters (which support `arbitraryConstraint`) and multi-field struct predicates (which Effect v4 evaluates via residual rejection sampling). For struct predicates, the rule will cease prescribing inert `toCodecArbitrary` annotations on `Struct` nodes, permit documented residual filters when acceptance density is sufficient, and instruct authors to use `Schema.declare` with `toCodecArbitrary` when sparse invariants require non-discarding constructive generation.

## Problem Frame

Effect Schema v4 `Arbitrary.schema` derives generators by compiling AST structures. It recognizes `arbitraryConstraint` exclusively for scalar/collection properties (`order`, `minimum`, `maximum`, `patterns`, `minLength`, `minProperties`, `uniqueBy`), merging them directly into generators without discards.

For cross-field invariants on records/structs (such as `low <= high` or `start < end`), Effect provides no multi-field constraint vocabulary. When `.check(makeFilter(...))` is placed on an `S.Struct`, Effect v4 compiles the base struct and applies the predicate via `applyFilters`, using rejection sampling (retrying discarded candidates up to `maxDiscards`).

The current lint rule `@systemfsoftware/oxlint-plugin-effect-schema/schema-filter-constructive-generation`:

1. Flags all `.check(makeFilter(...))` calls without metadata.
2. In `MISSING_FIX`, instructs the author to "annotate the base schema node with `toCodecArbitrary` before this check".
3. On an `S.Struct`, `toCodecArbitrary` is completely ignored by Effect's compiler (`compileObjects` never reads node annotations; `toCodecArbitrary` is read exclusively on `SchemaAST.Declaration`).
4. This forces authors to add dead annotations or dummy `candidate` blocks to appease the linter, creating a **Ritual Gate** (an instrument that checks a proxy that nothing executes, violating `CONSTITUTION.md CONST-E9` and `CONST-G4`).

## Requirements

- R1. Accurate Node-Kind Diagnostics in Lint Rule. `schema-filter-constructive-generation` MUST inspect the checked receiver. If the receiver is a `Struct`/`Objects` node and the predicate operates across properties, it MUST NOT prescribe attaching `toCodecArbitrary` to the struct.
- R2. Recognition of Residual Filtering. The lint rule MUST recognize that cross-field predicates on `S.Struct` are handled upstream via residual rejection sampling. It MUST allow unadorned cross-field struct filters when accompanied by a designated residual annotation/comment or opt-in configuration, without demanding inert `arbitraryConstraint` keys.
- R3. Actionable Constructive Guidance for Sparse Invariants. When an author requires non-discarding constructive generation (e.g. for sparse predicates that would exhaust `maxDiscards`), the lint rule's fix message MUST guide the author to convert the schema into a `Schema.declare` (which natively consumes `toCodecArbitrary`), rather than suggesting impossible struct annotations.
- R4. Documented Architecture Pattern. A solution doc (`docs/solutions/architecture-patterns/cross-field-schema-invariants-and-arbitrary-derivation.md`) MUST document: why `arbitraryConstraint` cannot represent cross-field relationships in Effect v4; the performance envelope of residual rejection sampling (acceptable for dense predicates, e.g. >20% pass rate); and the canonical `Schema.declare` pattern with `linkDecoding` / `toCodecArbitrary` for sparse invariants.

### Requirements by concern

**Rule verdicts (lint gate)**

- R1. Receiver-kind-aware diagnostics.
- R2. Residual filtering recognized as a declared choice.

**Guidance and doctrine**

- R3. Constructive guidance names `Schema.declare` for sparse invariants.
- R4. Architecture pattern documented under `docs/solutions/`.

## Key Decisions

- **Decision 1: No Ritual Annotations** (session-settled: user-approved — chosen over appeasing the gate with inert metadata: the gate must match the engine's real capability). Governs R1, R2.
- **Decision 2: Dual Path for Cross-Field Invariants** (session-settled: user-approved — chosen over a single-path mandate: dense predicates generate acceptably by discarding; sparse ones need a constructive `declare`). Governs R2, R3.

## Scope Boundaries

- Not in scope: modifying `repos/effect` upstream sources.
- Not in scope: reintroducing the deprecated Effect v3 fast-check `arbitrary: { candidate: ... }` runtime adapter.

## Success Criteria

- SC1. `pnpm check:local` passes without requiring inert annotations on valid struct filters.
- SC2. The test suite for `oxlint-plugin-effect-schema` includes tests demonstrating that `schema-filter-constructive-generation` correctly handles struct filters and gives actionable, non-inert guidance.
- SC3. The solution doc accurately describes the Effect v4 arbitrary compilation behavior and is indexed in `docs/solutions/`.

---

# Planning Contract

## Key Technical Decisions

- KTD1. **Verdicts key on the receiver chain's terminal vocabulary member.** `tracesToSchema` currently returns a boolean; it returns the terminal `Schema.*` member the receiver chain bottoms out at (directly or through a local const initializer). Three classes drive distinct verdicts: `declare` (constructive override readable), struct-like members (`Struct`, `Record`, `TaggedStruct`, `TaggedRecord`, and struct-returning combinators reachable syntactically), and scalar members. The `toCodecArbitrary` annotate-silencer fires only when the terminal is `declare` — verified against `repos/effect/packages/effect/src/internal/arbitrary/schema.ts`, where `ast.annotations?.toCodecArbitrary` is read solely inside `compileDeclaration`. Governs R1.
- KTD2. **`arbitrary: { candidate }` and the function-valued v3 `arbitrary` form stop being special cases; neither satisfies the rule.** In rc.116 the arbitrary compiler never reads a `candidate` key on filter annotations (verified: the only annotation consumers are `arbitraryConstraint` via `collectChecks` and `toCodecArbitrary` via `compileDeclaration`); accepting it endorses decoration. The rule's legacy arm — the `legacyArbitraryFunction` messageId, its `LEGACY_*` message constants, and the function-valued-`arbitrary` verdict branch — is deleted outright: a function-valued `arbitrary` is just non-satisfying metadata and reports under the receiver-routed verdict like any other. (session-settled: user-directed — chosen over keeping a dedicated legacy message: no v3 bookkeeping survives into the corrected rule. Governs R1, R2.)
- KTD3. **Residual acknowledgment is an explicit marker on the filter, not rule silence.** Shape: `arbitrary: { residual: true }` in the `makeFilter`/`makeFilterGroup` annotations object. It claims no constructive capability — it records a deliberate dense-predicate trade-off — so it does not trip the no-ritual bar (Decision 1 bans metadata _pretending_ to generate; this declares that generation is by discarding). A struct receiver without constructive metadata and without the marker reports a dedicated `filterResidualUndeclared` message naming both exits: declare the residual choice, or move to `Schema.declare`. The annotation form is the implemented residual-mark surface; the comment and opt-in-configuration alternatives R2's wording names are deferred. Governs R2, R3.
- KTD4. **Acceptance density stays doctrine, not rule arithmetic.** A textual rule cannot measure a predicate's pass rate, so dense-vs-sparse guidance lives in the solution doc and the message text ("residual filtering suits predicates that accept a large share of draws"); the rule only requires the choice to be visible. Mirrors `docs/solutions/architecture-patterns/a-schema-type-claim-can-outrun-its-examination.md`: where the form is not the defect, the gate requires justification. Governs R2.

### Assumptions

- The struct-like member set is enumerated syntactically (vocabulary member names); members added to Effect later need a one-line rule update. The fail-open posture of `resolveImportOrigin` (opaque → no accusation) already covers unrecognized chains.
- No production call sites exist to migrate: the only `.check(S.makeFilter(...))` occurrences in the repo are the plugin's own fixtures and plan documents (verified by search).

---

# Implementation Units

## Implementation Units

### U1. Receiver-kind-aware verdicts and message catalog

- **Goal:** The rule reports each check site according to what the receiver chain actually is, and every message names only exits the engine honors.
- **Requirements:** R1, R2, R3
- **Dependencies:** none
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-filter-constructive-generation.ts`
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-filter-constructive-generation.config.ts`
- **Approach:**
  1. Change `tracesToSchema` to return the terminal vocabulary member name (or `null`), keeping the existing walk depth and local-const resolution; a `null` terminal (unrecognized chain) produces no accusation — fail-open, matching `resolveImportOrigin`'s posture.
  2. Gate the `receiverHasOverride` silencer on terminal `declare` (KTD1); rework its boolean conjunct to consume the terminal member instead of a separate boolean walk.
  3. Add `hasResidualDeclaration` alongside `hasConstructiveMetadata`; demote `arbitrary: { candidate }` from satisfying to non-satisfying and delete the `'legacy'` verdict branch so a function-valued `arbitrary` lands in the ordinary non-satisfying path (KTD2, KTD3).
  4. In the catalog, enumerate all three messageIds: keep the existing `filterDiscards` messageId for scalar-terminal receivers whose filter lacks constructive metadata, rewriting its `MISSING_FIX` data to drop the node-annotation advice and name `arbitraryConstraint` (vocabulary predicates), the residual marker (dense cross-field, per KTD4), and `Schema.declare` with `toCodecArbitrary` (sparse); add the new `filterResidualUndeclared` messageId for struct-terminal receivers lacking both constructive metadata and the residual marker, naming the two struct exits (marker or `Schema.declare`); delete `legacyArbitraryFunction`, `LEGACY_EXPECTED`, `LEGACY_ACTUAL`, and `LEGACY_FIX` from the config and the `MessageIds` union.
- **Patterns to follow:** existing visitor shape, scope resolution, and verdict plumbing in the same rule file; message constants style in the sibling `.config.ts`.
- **Test scenarios:** covered by U2 (this unit lands with U2 in one commit; the rule is an Evaluator surface and its behavior change is proven by its own fixtures).
- **Verification:** rule test suite passes with U2's migrated expectations; no production file's lint verdict changes other than intended fixture flips.

### U2. Test suite: migrated fixtures and receiver-kind scenarios

- **Goal:** The suite pins the corrected verdicts with known-bad/known-good pairs, including the four currently-valid fixtures that become invalid.
- **Requirements:** R1, R2, SC2
- **Dependencies:** U1
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/__tests__/schema-filter-constructive-generation.test.ts`
- **Approach:**
  - Flip `Should_Pass_When_NodeOverrideIsToCodecArbitrary` (String receiver) and `Should_Pass_When_OverrideLivesOnLocalReceiverDeclaration` (Struct receiver) to invalid — the annotate is inert off `declare`.
  - Flip `Should_Pass_When_InlineFilterCarriesCandidate` and `Should_Pass_When_SharedBindingCarriesMetadata` to invalid (candidate is decoration).
  - Re-point `Should_Fail_When_ArbitraryIsFunctionValued` and rename `Should_Fail_When_ExportedFilterIsLegacy` to `Should_Fail_When_ExportedFilterCarriesFunctionValuedArbitrary`, both expecting the discards verdicts for their receivers; delete the `legacyError`/`exportedLegacyError` helpers.
- **Test scenarios:**
  - Valid: struct receiver + `arbitrary: { residual: true }` on the filter; struct receiver + `arbitraryConstraint` keys; `declare`-terminated chain + `.annotate({ toCodecArbitrary })` before check; scalar receiver + `arbitraryConstraint` (unchanged); imported filter binding (unchanged); exported filter carrying the residual marker at its declaration; alias-namespace struct receiver with the marker.
  - Invalid: struct receiver, bare filter → `filterResidualUndeclared`; struct receiver + candidate-only → reports; scalar receiver + candidate-only → `filterDiscards`; scalar receiver + function-valued `arbitrary` → `filterDiscards`; String receiver + `.annotate({ toCodecArbitrary })` → `filterDiscards` (inert override — the silencer does not fire off `declare`); struct receiver + `.annotate({ toCodecArbitrary })` → reports; override placed after `.check` (unchanged); exported filter with candidate only → exported form; exported filter with function-valued `arbitrary` → exported discards form.
  - Edge: destructured `check` call form; foreign `builder.annotate(...).check(...)` still reports (origin rejection); `makeFilterGroup` with one unmarked member.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test` green; each new messageId asserted with its data payload.

### U3. Public surface: README, api report, changeset

- **Goal:** The published rule documentation matches the corrected semantics, and the release intent records the consumer-observable change.
- **Requirements:** R1, R2, R3
- **Dependencies:** U1, U2
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/README.md`
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/etc/oxlint-plugin-effect-schema.api.md`
  - `.changeset/` (new intent)
- **Approach:**
  1. Rewrite the `schema-filter-constructive-generation` README row: receiver-kind verdicts, residual marker, `declare`-only override silencer, no inert-metadata acceptance.
  2. Regenerate the api report via the repo's `pnpm api:update`.
  3. Ship the changeset via `pnpm change --bump minor`; body states the behavior change (candidate no longer satisfies; struct filters need the residual marker or `Schema.declare`) — consumer-observable facts only.
- **Test expectation:** none — documentation and release surface; correctness is the drift-free api regen.
- **Verification:** api report regeneration produces no diff after commit; changeset-check workflow accepts the intent.

### U4. Solution doc and glossary entry

- **Goal:** The doctrine that justifies the rule's shape is recorded where authors and future planners read it (R4, SC3), and the domain term enters `CONCEPTS.md`.
- **Requirements:** R4, SC3
- **Dependencies:** U1 (so the doc describes shipped semantics)
- **Files:**
  - `docs/solutions/architecture-patterns/cross-field-schema-invariants-and-arbitrary-derivation.md`
  - `CONCEPTS.md`
- **Approach:**
  - Solution doc: why `arbitraryConstraint` cannot express cross-field relationships (cite the vendored compiler paths); residual rejection sampling's envelope — dense predicates (roughly ≥20% acceptance) generate fine under `maxDiscards`, sparse ones exhaust it; the canonical `Schema.declare` + `toCodecArbitrary` pattern for sparse invariants; the residual marker as the justification form a textual gate requires (KTD4). Cite `repos/effect/packages/effect/src/internal/arbitrary/schema.ts` paths read.
  - `CONCEPTS.md`: add a `Residual filter` entry under Schema verification — a filter the arbitrary engine satisfies by rejection sampling, declared with the residual marker; distinct from `Fabricated arbitrary` (test-side hand-built generator).
- **Patterns to follow:** existing solution-doc shape (Context / What was measured / Guidance / Related) and existing `CONCEPTS.md` entry format.
- **Test expectation:** none — doctrine surface, never a gate input.
- **Verification:** doc exists at the R4 path; `CONCEPTS.md` entry follows the existing heading style.

---

# Verification Contract

- `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test` — the rule suite (U2) is the red/green proof for the behavior change.
- `pnpm check:local` — repo gate after the last edit (SC1).
- `pnpm api:update` leaves no diff after U3 (drift-free generated surface).
- The rule change lands as its own commit (Evaluator surface discipline: never shared with work it judges; fixtures observed red before and green after).

## Definition of Done

- All four units complete; the four previously-valid fixtures (two inert-annotate, two candidate-decoration) now fail with the intended messageIds and pass under the residual/declare forms (SC2).
- No message text or silencer in the rule prescribes or accepts metadata the rc.116 arbitrary compiler does not read (R1–R3, Decision 1).
- Solution doc and `CONCEPTS.md` entry present (R4, SC3); `pnpm check:local` exits 0 (SC1).
- Changeset intent recorded; no scratch or experimental files left in the diff.
