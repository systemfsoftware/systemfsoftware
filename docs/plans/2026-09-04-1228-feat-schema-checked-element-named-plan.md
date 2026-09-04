---
title: "feat: Name-checked-element gate for schema collections"
date: 2026-09-04
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Name-checked-element gate for schema collections

## Goal Capsule

- **Objective:** an Effect Schema author who passes a `.check(...)`-carrying schema inline as the element of a collection combinator gets a deterministic lint error at write time, with the fix that binds the checked node to a module-scope name — so the invariant the filter carries has one named home for its metadata, its diagnostics, and its property tests.
- **Means:** a new recommended rule in `@systemfsoftware/oxlint-plugin-effect-schema`, keyed on origin-resolved Schema-vocabulary collection calls whose element chains contain a `check` (KTD1).
- **Authority:** this plan; the session-settled decisions labeled below; repo doctrine (CONSTITUTION.md, packages/lint/oxlint/plugins/AGENTS.md OX-* rules) where this plan is silent.
- **Stop conditions:** the rule cannot reach near-zero false positives without keying on a consumer's types (out of reach for a type-blind JS plugin); the migration or early consumer reports show the rule's cost concentrated on shapes where a name pays nothing — that is a cost re-evaluation of the settled gate, raised before the rule propagates further, not a detection-logic fix.
- **Execution profile:** two sequential commits on branch `schema-v4-migrate`, shipped on the open PR #350.
- **Tail ownership:** LFG shipping tail owns commit/push/PR-update/CI-watch.

## Product Contract

### Summary

Add an oxlint rule that reports a schema node carrying `.check(...)` when that node is constructed inline (not bound to a module-scope const) directly inside a Schema collection combinator — `Array`, `Record`, `Tuple`, `Set`, `Map`, `Union` — and prescribes extracting the checked chain into a named declaration.

### Problem Frame

A filter on a schema node is an invariant, and the v4 generation model makes the schema its own generator: constructive metadata (`arbitrary.constraint` / `arbitrary.candidate`) hangs on the filter, and property tests of the predicate need the unchecked base schema as a value. Both require the checked node to exist as a named binding. An inline `S.Array(S.Struct({...}).pipe(S.check(f)))` has no such binding: the base cannot be imported into a test, and the invariant has no name an error or a reviewer can hold onto. The existing `schema-filter-constructive-generation` rule governs what the filter carries; nothing governs where the checked node lives.

### Requirements

- R1. A `CallExpression` whose callee resolves to a Schema-vocabulary collection combinator (`Array`, `Record`, `Tuple`, `Set`, `Map`, `Union`) reports when any element argument's own call chain contains a `check` call (member form `X.check(...)` or piped form `.pipe(S.check(...))`), per the member-form and destructured/named-import resolution the sibling rule already proves.
- R6. The rule ships at `error` in the plugin's recommended config, with a RuleTester suite at 100% mutation coverage, a README rule-table row, and a changeset; suppression ids use the config-key form (`@systemfsoftware/oxlint-plugin-effect-dmmf/schema-checked-element-named` at the aggregate layer — the runtime namespace is the aggregate's package name per `packages/lint/oxlint/config/src/oxlint-config.base.ts` jsPlugins registration).
- R3. The rule does not report on anonymous collection elements that carry no check; plain inline structs are legitimate one-off wire shapes.
- R4. The rule does not report on checked nodes outside collection element position (struct fields, standalone declarations); those are governed elsewhere or legal.
- R5. The report names the combinator and prescribes the extraction: bind the checked chain to a module-scope const and pass the name to the combinator.
- R6. The rule ships at `error` in the plugin's recommended config, with a RuleTester suite at 100% mutation coverage, a README rule-table row, and a changeset; suppression ids use the config-key form (`@systemfsoftware/effect-dmmf/schema-checked-element-named` at the aggregate layer).

### Key Decisions

- **Gate keys on the check, not the shape** (session-settled: user-approved — chosen over banning all anonymous structs in collections: plain inline structs are legitimate one-off wire shapes and a blanket ban is taste dressed as rot). Governs R1, R3.
- **Named binding anywhere in scope silences the element** (session-settled: user-approved — chosen over module-scope-only recognition: an imported binding's check is governed at its home, consistent with the sibling rule's imported-filter doctrine). Governs R2.
- **Multi-check chains stay legal when named; the anonymous multi-check element reports once per element** — check count is not the defect, anonymity is (session-settled: user-approved — chosen over per-check reporting: one invariant-location defect per element). Governs R1.

### Scope Boundaries

- Deferred to Follow-Up Work: a TTSR rule or skill-prose update teaching the extraction doctrine to agent sessions; the gate alone is this plan's reach.
- Outside this product's identity: type-aware detection (oxlint JS plugins receive no type channel); gating checked nodes in struct-field position (the declaration family owns declaration placement; field-inline checks on bound parents are in-tree norm).

## Planning Contract

### Key Technical Decisions

- KTD1. **Detection descends the element expression, not the file.** Visitor: `CallExpression`. When the callee resolves through `resolveImportOrigin` + `isSchemaVocabularyOrigin` to a collection combinator name in the six-name set, inspect each element argument with a bounded (`MAX_WALK_DEPTH = 32`, matching the sibling) recursive descent that (a) follows `CallExpression.callee.object` through member/pipe chains, (b) recurses into every call's arguments — this is what reaches `S.check(f)` sitting as a `.pipe(...)` argument and checks buried inside non-forwarding identity wrappers such as `Wire.mint(...)`, which `resolveImportOrigin` deliberately refuses (`FORWARDING_MEMBERS` covers only `bind`/`call`/`apply`), and (c) treats an `ArrayExpression` argument's elements as elements (v4 `Union` takes an array literal, as at `packages/testing/mutation/stryker-js/stryker-js/src/Schema.schema.ts:140`). A `check` is recognized by origin resolution of its callee — member form `X.check(...)` or a destructured/named `check` import from the Schema vocabulary — never by identifier text. An element that is a pure reference (`Identifier` or a member chain with no call) passes unresolved; a named base with an inline check (`S.Array(Raw.pipe(S.check(f)))`) still reports, because the checked node itself is anonymous. TS expression wrappers (parenthesized, `as`/`satisfies`, comma sequences) are transparent to the descent. (session-settled: user-approved — chosen over shape-keyed detection: the label-routed-rules learning shows shape keys silently vacate; scope/origin resolution is the falsifiable key.)
- KTD2. **Message honesty: the fix prescribes extraction, not auto-naming.** The vendored v4 JSON Schema compiler names `$defs` entries from the `identifier` _annotation_ (`repos/effect/packages/effect/src/internal/schema/toRepresentation.ts` — `defaultReferencePolicy` keys references on `identifier`), not from a variable binding; extraction creates the single place to hang that annotation and the constructive metadata, it does not itself name the `$defs` entry. The `{{fix}}` text carries the named-home rationale so the fix reads as a decision procedure, not an address relocation (OX-EF2): "bind the checked chain to a module-scope const and pass the name to the combinator — the binding is the one home for the invariant's constructive metadata and the unchecked base its property tests generate from".
- KTD3. **Static strings live in `<rule>.config.ts`**; the rule file holds only logic (OX-CS1, and stryker excludes `*.config.ts` from mutation, so message text is free of the 100% obligation). Message template follows OX-EF1 (`{{name}} is forbidden. Expected: … Actual: … Fix: …`).
- KTD4. **One narrow rule, no options.** The granularity reading (ESLint-generic vs Stylelint-singular-purpose) resolves here as singular-purpose: the rule bans one construct (anonymous checked element) with one message; there is no parameter that is not a policy fork. Considered and rejected: extending the sibling `schema-filter-constructive-generation` with a second messageId — the sibling owns filter-content doctrine (what a filter carries), this rule owns element-placement doctrine (where a checked node lives); the two differ in detection (check-argument inspection vs element-expression descent) and in message, which is exactly the shape the granularity reading says consolidation loses on.

### Assumptions

Destructive review ran on this plan (lens: the source's claim vs what its bytes assert). The four assumptions it surfaced, with outcomes:

1. _Extraction restores the name in diagnostics and `$defs`._ — **Killed in part by the lens:** `$defs` naming comes from the `identifier` annotation, not the binding (KTD2). Surviving claim, restated at byte-strength: extraction creates one named home where the annotation, the constructive metadata, and the testable unchecked base can live. Warrant: vendored source.
2. _Keying on every check (including built-in constraint filters) on an anonymous collection element keeps near-deterministic precision._ — Survives on the settled key (KTD1) with corrected survey evidence: three live sites fire — the two `wire.schema.ts` schemas carry custom `makeFilter` predicates, and the stryker-js concurrency `Union` carries **built-in** constraint filters (`isGreaterThanOrEqualTo`, `isPattern`). Built-in checks do occur in this position, so the no-carveout key spends real migration budget on them; that cost is accepted under the settled decision. Warrant: session-settled + repo survey.
3. _The property-test-surface rationale binds consumers._ — Survives as affordance, not law: nothing forces a consumer to property-test a predicate, so the rule's message states the mechanical defect (no named home for the invariant's metadata), not a testing obligation. Warrant: claim-vs-bytes lens on the design rationale.
4. _Firing on aliased Schema imports is deliberate, despite OX-CI1's "never aliases" text._ — The rule resolves aliases through `resolveImportOrigin` (an alias of the same package import is the same binding), matching the shipped sibling rule, which fires on `import { Schema as S }` in its own suite. OX-CI1's text predates origin-resolved rules and targets name-keyed matching; reconciling the doctrine text with the origin-resolution family is deferred follow-up (a doctrine edit, separate change). Declared here per CONST-W3 — no silent bypass.

### Sequencing

U1 (rule + suite, unenrolled) lands before U2 (enrollment + migration + proof) so the suite exists to kill mutants before the rule can fire on the tree.

## Implementation Units

### U1. Rule, config, and RuleTester suite

**Goal:** the rule exists, detects per KTD1, and is proven by fixtures at 100% mutation coverage — but is not yet enrolled, so the tree cannot fire it.
**Requirements:** R1, R2, R3, R4, R5 (rule text), R6 (suite half).
**Files:** create `packages/lint/oxlint/plugins/effect/schema/src/rules/schema-checked-element-named.ts`, `packages/lint/oxlint/plugins/effect/schema/src/rules/schema-checked-element-named.config.ts`, `packages/lint/oxlint/plugins/effect/schema/src/rules/__tests__/schema-checked-element-named.test.ts`.
**Approach:**

1. Mirror the sibling rule's skeleton: `defineRule({ meta, create })` with meta imported from the config file; `getScope` bound from `context.sourceCode.getScope`; visitors `CallExpression` only (no Program-level export tracking needed — binding references pass syntactically).
2. Reuse `resolveImportOrigin`, `isSchemaVocabularyOrigin`, `originMemberSequence` from `ImportOrigin.ts`; re-declare the five-line `vocabularyMemberOf` pattern locally (the sibling keeps it private by convention).
3. Collection detection: callee's resolved member name ∈ {`Array`, `Record`, `Tuple`, `Set`, `Map`, `Union`}. Element inspection: the KTD1 descent over each argument — callee-object chains plus recursion into call arguments (covers `.pipe(S.check(f))` and `Wire.mint(...)` wrappers) and into `ArrayExpression` elements; `Identifier`/`MemberExpression`-only elements pass.
4. Report at the check call node with `messageId: 'anonymousCheckedElement'` and data from config constants naming the combinator.
   **Patterns to follow:** `schema-filter-constructive-generation.ts` (visitor shape, scope resolution, report data), its `.config.ts` (OX-CS1/EF1), its test suite (`createRuleTester`, `Should_<Behavior>_When_<Condition>` names, `/repo/pkg/src/domain.schema.ts` filenames).
   **Test scenarios:**

- Valid: named local binding with a check passed to `S.Array`; imported binding passed to `S.Array`; anonymous plain struct in `S.Array` (no check); anonymous struct with check as a struct _field_ (not a collection element); named base plus further non-check combinators as the element; a foreign object's `.check` method inside `S.Array` (origin resolution must reject); multi-check chain on a named binding inside `S.Union`; checked element under an aliased namespace import used with a named binding.
- Invalid: `S.Array(S.Struct({...}).pipe(S.check(f)))` reports once; member-form `S.Array(S.String.check(f))` reports; `S.Tuple(A, S.Struct({...}).pipe(S.check(f)))` reports on the second element only; variadic `S.Union(S.String, S.Struct({...}).pipe(S.check(f)))` reports; array-literal `S.Union([Wire.mint(Wire.mint(S.Finite).pipe(S.check(S.isGreaterThanOrEqualTo(1)))), Wire.mint(Wire.mint(S.String).pipe(S.check(S.isPattern(/^(100|[1-9]?[0-9])%$/))))])` reports once per checked element (the real stryker-js shape); `S.Record({ key, value })` with checked value reports; `S.Set` and `S.Map` checked elements report; named base with inline check `S.Array(Raw.pipe(S.check(f)))` reports (the checked node is still anonymous); nested `S.Array(S.Array(S.Struct({...}).pipe(S.check(f))))` reports exactly once at the inner check; aliased-namespace inline check reports; destructured/named-import `check` form reports; anonymous multi-check element reports exactly once (dedupe at the element).
  **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test` green; suite kills the rule's mutants under the package's stryker config (CI mutation workflow is the gate; do not run mutation locally).

### U2. Enrollment, API report, migration, red-path proof, docs

**Goal:** the rule fires on the tree and on consumers; every in-tree violation is migrated; the red path is proven against a real file, not only fixtures.
**Requirements:** R6, R1 (end-to-end).
**Dependencies:** U1.
**Files:** modify `packages/lint/oxlint/plugins/effect/schema/src/index.ts` (import, `rules` map, `recommendedRules` at `error`); regenerate `packages/lint/oxlint/plugins/effect/schema/etc/oxlint-plugin-effect-schema.api.md` via `pnpm api:update`; add the README rule-table row; migrate all three fired sites: `omp/plugins/omp-claude-compat/src/hooks/wire.schema.ts` — extract `ClaudeEdit` from `ClaudeEdits` and `OmpEdit` from `OmpEdits` (same file, same shape); `packages/testing/mutation/stryker-js/stryker-js/src/Schema.schema.ts` — extract the two checked `Wire.mint(...)` Union members as named consts (e.g. `ConcurrencyCount`, `ConcurrencyPercent`); create the changeset via `pnpm change --bump minor` (new rule = consumer-observable API surface).
**Approach:**

1. Enroll, regenerate the API report, then run the repo lint through a Tier-A consumer config: all three known sites must report.
2. Migrate each site by extracting the checked chain into an exported module-scope const and passing the name to the combinator; where the schema is the boundary contract, attach the `identifier` annotation on the extracted const (KTD2 makes the $defs name possible here).
3. Red-path proof beyond fixtures: with the migration reverted at exactly one site, the repo gate must fail naming the rule; restore the migration.
4. README row states the true claim: a checked schema node inside a collection combinator must live in a named module-scope declaration so the invariant has one home for its constructive metadata and its tests.
   **Test expectation:** none beyond U1's suite — this unit is enrollment and migration; its proof is the gate failing before the migration and passing after (observed red → green).
   **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema build` (runs `api:check` against the regenerated report); `pnpm check:local` green; the red-path probe observed failing before migration.

## Verification Contract

| Gate                   | Command                                                                   | Proves                                                                               |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rule suite             | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test`         | detection and near-miss behavior per U1 scenarios                                    |
| Typecheck + API report | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema build`        | rule compiles; `api:check` accepts the regenerated report                            |
| Repo gate              | `pnpm check:local`                                                        | migration complete; no in-tree violations remain                                     |
| Red path               | revert one migration site, run the repo lint, observe the report, restore | the rule fires on a real file through the aggregate config key                       |
| CI                     | `gh pr checks --watch --fail-fast` on PR #350                             | build, contract tests, and the mutation report (100% thresholds) accept the new rule |

## Definition of Done

- The rule reports every U1 invalid scenario and none of the valid ones, at `error` in recommended, with the suppression id working in the config-key form.
- All three known in-tree sites are migrated; `pnpm check:local` is green; the red-path probe was observed failing and restored.
- API report regenerated; README row and changeset present; PR #350 carries the work and CI is green, mutation report included.
- No abandoned-attempt code (probe scripts, reverted migrations, scratch fixtures outside the suite) remains in the diff.
