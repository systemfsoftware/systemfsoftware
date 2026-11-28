---
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
title: "Struct-Level Filters Report filterResidualUndeclared - Plan"
date: "2026-11-28"
type: "fix"
topic: "schema-filter-constructive-generation-struct-residual"
execution: code
---

# Struct-Level Filters Report filterResidualUndeclared - Plan

## Goal Capsule

- **Objective:** An author who adds a struct-level `Schema.makeFilter` without saying how it generates gets a lint error naming the fix, instead of a clean lint and a property test that later exhausts `maxDiscards`.
- **Means:** `schema-filter-constructive-generation` gains a struct-receiver verdict reported as `filterResidualUndeclared` (KTD1, KTD2).
- **Authority:** the package README's rule row is the contract the code failed; Effect's installed arbitrary compiler decides which annotation keys are real.
- **Execution profile:** one PR in this repository, merged with `--squash --admin` once its workflow runs are green and its review rounds hold no open P0/P1.
- **Stop conditions:** stop if the review rules the residual marker an escape hatch that must not exist; the rule then needs a different declaration and this plan is revised before merge.

---

## Product Contract

### Summary

The rule reports a filter on a `Struct`, `Record`, `TaggedStruct` or `TaggedRecord` receiver unless its annotations carry the literal `arbitrary: { residual: true }` or an `arbitraryConstraint` with `minProperties` / `maxProperties`. Scalar verdicts stay as they are. The data-last `Schema.check(f)` forms get the same receiver-aware verdict as the `.check()` method.

### Problem Frame

The README row for `schema-filter-constructive-generation` promises that struct filters without metadata or the residual marker report `filterResidualUndeclared`. The rule's code returns early for every struct receiver, and no such messageId exists. A struct filter such as `start <= end` carrying only a `message`, whether written directly on a `Struct` or on a `Struct` passed as a class's fields, lints clean with no generation declaration. The README and the earlier plan for this rule (`docs/plans/2026-09-20-1949-feat-schema-filter-constructive-generation-cross-field-plan.md`, KTD3) chose an explicit marker. The shipped code and its solution doc instead chose silence.

### Requirements

**Struct receivers**

- R1. A filter consumed by `check` on a `Struct`, `Record`, `TaggedStruct` or `TaggedRecord` receiver (including one passed inline as a class's fields) reports `filterResidualUndeclared` unless it declares its generation.
- R2. The declaration is the literal `arbitrary: { residual: true }`, or an `arbitraryConstraint` naming `minProperties` or `maxProperties`. `residual: false`, a misspelt key, a non-literal value, a scalar-only constraint, a `message`, or an inert `toCodecArbitrary` on the struct does not count.
- R3. Annotations the rule cannot read statically (a spread) stay trusted, as they are for scalar filters today.

**Receiver forms**

- R4. `X.pipe(Schema.check(f))` and `Schema.check(f)(X)` take their receiver from `X`, so R1 applies to them.

**Unchanged behaviour**

- R5. Scalar receivers keep their `filterDiscards` verdict and messages. The residual marker does not satisfy a scalar filter. The `Schema.declare` + `toCodecArbitrary` silencer, exported-filter handling and imported-filter trust are unchanged.

### Scope Boundaries

- Exported filters keep the scalar `filterDiscards` verdict even when they carry the residual marker, because their receiver is not visible at the export site. Revisit if a consumer needs to export a struct-level filter.
- A `.check()` on a receiver the rule cannot trace (an imported schema, a class identifier) keeps today's scalar verdict.
- Members of a `makeFilterGroup` are not inspected one by one. The group's own annotations decide, as today.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Keep `arbitrary: { residual: true }` as the declaration, matched as an exact literal shape.** Effect 4.1.4 reads no `arbitrary` key: its arbitrary compiler reads only `arbitraryConstraint` and, on `Schema.declare`, `toCodecArbitrary` (`internal/arbitrary/schema.js`). The key type-checks through the `Annotations` index signature. A design review ruled the marker the right shape because it is the one the README and the earlier plan already name. The rule must therefore validate it strictly, since the compiler never will.
- KTD2. **A separate messageId, `filterResidualUndeclared`, with struct-specific expected/actual/fix text.** The remedy differs from the scalar one: `arbitraryConstraint` cannot express a cross-field relation. Keeping `filterDiscards` untouched leaves every scalar test and consumer suppression stable.
- KTD3. **Accept `minProperties` / `maxProperties` constraints on struct receivers and nothing else from the constraint vocabulary.** These are the only constraint keys the compiler applies to an object. A scalar key such as `minimum` on a struct filter is ignored at generation, so accepting it would let a no-op pass.
- KTD4. **Resolve data-last receivers syntactically from the parent node.** `Schema.check` is told apart from a schema's own `.check` method by its import-origin member path below the Schema module being exactly `check`. The receiver is the `.pipe` call's object or the curried call's first argument. Without this, a struct filter written in the pipe form fell back to the scalar verdict, and the residual marker could not satisfy it.

### Risks

- **The marker is author-written text with no runtime effect.** The check-hygiene rule bans escape hatches: nothing whose only effect is to silence the rule on the author's own code (pack: check-hygiene, a-lint-rule-enforces-a-decision-it-never-makes-one.md). The marker records a density judgement the rule cannot make. It silences nothing beyond the one filter it sits on, and a misspelt or false marker still reports. The PR's review round must rule on this before merge; a ruling against it trips the Goal Capsule stop condition.
- **Previously clean consumer code now reports.** That is the fix. The changeset states it, and no struct-level filter in this repository needs a marker.

---

## Implementation Units

### U1. Struct-receiver verdict and data-last receivers

- **Goal:** the rule reports undeclared struct-level filters and resolves data-last receivers.
- **Requirements:** R1, R2, R3, R4, R5; KTD1, KTD2, KTD3, KTD4.
- **Dependencies:** none.
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-filter-constructive-generation.ts`
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-filter-constructive-generation.config.ts`
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/__tests__/schema-filter-constructive-generation.test.ts`
- **Approach:**
  1. Replace the struct early return in `reportFilter` with a struct verdict and a `filterResidualUndeclared` report.
  2. Add the residual name/expected/actual/fix strings and the messageId to the config.
  3. Resolve the receiver of `Schema.check` from the parent `.pipe` or curried call.
- **Patterns to follow:** the existing `hasConstructiveMetadata` tri-state verdict (`yes` / `no` / `opaque`). Tests follow the file's RuleTester shape, asserting messageId plus full data.
- **Test scenarios:**
  - A `Struct` filter carrying only `message` reports `filterResidualUndeclared`.
  - A `Struct` filter bound to a local const with only `expected` reports.
  - An inline `TaggedStruct` filter with no annotations reports.
  - A `Struct` with a filter passed as `TaggedClass` fields reports.
  - A `Record` filter with no annotations reports.
  - `Shape.pipe(S.check(filter))` on a local `Struct` reports, and with the marker is clean.
  - The curried `check(filter)(Schema.Struct(...))` reports.
  - `residual: false` and a misspelt `residaul: true` report.
  - A struct filter whose `arbitraryConstraint` holds only `minimum` reports.
  - A `Struct` annotated with `toCodecArbitrary` before `.check` reports (the override is inert there).
  - `Struct` and inline `TaggedStruct` filters with `arbitrary: { residual: true }` are clean.
  - A `Record` filter with `arbitraryConstraint: { minProperties: 2 }` is clean.
  - A scalar filter carrying only the residual marker still reports `filterDiscards`.
  - `Schema.Int.pipe(Schema.check(bare))` still reports `filterDiscards`.
- **Verification:** the rule's test file passes, and reinstating the old struct early return makes the new struct cases fail.

### U2. Contract docs and changeset

- **Goal:** the README row, the solution doc and the release notes describe the rule that now ships.
- **Requirements:** R1, R2, R4, R5.
- **Dependencies:** U1.
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-effect-schema/README.md`
  - `docs/solutions/architecture-patterns/cross-field-schema-invariants-and-arbitrary-derivation.md`
  - `.changeset/<generated>.md`
- **Approach:**
  1. Rewrite the rule's README row to name both messageIds, the exact marker shape and the data-last forms.
  2. Correct the solution doc's dense-invariant example to carry the marker. Record why the gate drifted: no test pinned the README's promise.
  3. Author a `minor` intent with `pnpm change`, stating the consumer-visible behaviour change (pack: package-surface, surface-changes-are-versioned.md).
- **Test expectation:** none -- documentation and release intent.
- **Verification:** the Changeset Check workflow passes and the README row matches the rule's messages.

---

## Verification Contract

| Gate       | Command (package directory)                                    | Proves                                |
| ---------- | -------------------------------------------------------------- | ------------------------------------- |
| Rule tests | `pnpm test`                                                    | R1-R5                                 |
| Typecheck  | `pnpm typecheck`                                               | the rule and tests compile            |
| Lint       | `pnpm lint`                                                    | package lint stays clean              |
| API report | `pnpm build` (runs `api:check`)                                | no public surface drift               |
| CI         | the PR's workflow runs, read with `gh run list --commit <sha>` | repo gates, including Changeset Check |

Each command runs under `timeout -k`. The full suite and e2e are not run locally.

---

## Definition of Done

- U1 and U2 land in one PR; every workflow run on its head is green.
- The review round holds no unrefuted P0/P1, and any refutation has gone through a later round.
- No abandoned-attempt code is left in the diff.
- The PR is merged with `--squash --admin`.
