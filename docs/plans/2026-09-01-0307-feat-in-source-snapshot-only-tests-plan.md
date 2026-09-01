---
title: In-Source Snapshot-Only Test Policy - Plan
type: feat
date: 2026-09-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# In-Source Snapshot-Only Test Policy - Plan

## Goal Capsule

- **Objective:** An agent authoring tests in this repo cannot land a hand-written in-source test that restates the implementation. In-source test blocks pin authored intended output as inline snapshots over non-exported symbols; the generated schema-law channel (`ruleOfSchemas`, delivered by the schema-vite plugin) is untouched; property coverage remains where doctrine already puts it — the workflow's exported contract — never beside private helpers.
- **Means:** a new oxlint rule in the test-placement plugin enforcing snapshot-only in-source blocks, plus migration of the 25 existing in-source test files (KD1, KD2, KD3, KD4, KTD1).
- **Authority hierarchy:** the user's policy directive (this session, including the generated-laws exclusion) outranks existing doctrine texts; this plan outranks implementation convenience; existing lint rules outranks prose doctrine where they disagree.
- **Execution profile:** LFG pipeline, no synchronous user.
- **Stop conditions:** the lint gate stays red after migration is claimed complete; the in-source census at implementation time differs materially from the one recorded here (new files, new forms); a settled decision proves infeasible.
- **Tail ownership:** `ce-work` executes the units; LFG ships the branch.

---

## Product Contract

### Summary

Hand-written in-source `if (import.meta.vitest)` test content narrows to one assertion form: `expect(...).toMatchInlineSnapshot(...)` with authored expected content, over non-exported symbols only. Hand-written property tests (`it.prop`, fast-check arbitraries) are banned in-source; the generated schema-law channel — `ruleOfSchemas(...)` calls, the mechanism `@systemfsoftware/effect-schema-vite` builds on — is explicitly excluded from the ban. A new oxlint rule enforces all of it at error severity. The 25 existing in-source test files are migrated: hand-written property blocks deleted, example blocks converted to authored inline snapshots or deleted as tautologies, the one block covering an exported symbol deleted with its coverage posture recorded.

### Problem Frame

In-source tests in this repo are authored by agents, and agents keep producing two failure shapes: example tests that restate the implementation they sit beside (tautologies — the assertion re-derives what the code computes), and property tests over private helpers that replicate the implementation's own logic as its oracle. Both shapes pass every existing lint rule; the census below is the measurement: 25 in-source test files, zero of them snapshot-shaped, including blocks duplicating what generated schema laws already cover (documented as tautological in `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md`). Restricting the hand-written in-source channel to inline snapshots removes the tautology surface where it is cheapest to write: a snapshot carries a literal expected value, so the computed-expectation shape — the assertion that re-runs the implementation as its own oracle — has no syntax to live in. Banning in-source property tests pushes quantified verification to the workflow's exported contract, where the pure core is exercised through its boundary — the Impureim Sandwich discipline the user named — instead of beside the machinery it claims to check.

### Key Decisions

- KD1. **Hand-written in-source tests are snapshot tests only.** Snapshots carry literal expected values, so the computed-expectation tautology shape has no syntax to live in. (session-settled: user-directed — chosen over allowing example-based in-source tests: fights tautologies.) Governs R1. Conflict call-out: review challenged that capture-based snapshots relocate false confidence to capture time rather than eliminating it; the challenge stands as a preference disagreement with a user-directed decision, mitigated by KTD2's authored-literal doctrine and the rule's empty-placeholder ban (R4).
- KD2. **In-source tests cover only non-exported symbols.** Exported behavior is tested at the layers that own it. (session-settled: user-directed — chosen over allowing in-source tests of exported API: keeps the in-source channel private-only.) Governs R2.
- KD3. **Hand-written in-source property tests are banned.** Property tests pay at the workflow's exported contract, not beside private helpers. (session-settled: user-directed — chosen over allowing in-source property tests: corners agents out of pure-sandwich violations.) Governs R3.
- KD4. **The generated schema-law channel is excluded from the ban.** `ruleOfSchemas(...)` calls register generated codec laws — the mechanism the schema-vite plugin generates `schema-laws.test.ts` from — not hand-written property tests, so the rule never flags them. (session-settled: user-directed — chosen over flagging `ruleOfSchemas` call sites: generated laws are the vite-plugin mechanism, not hand-authored properties.) Governs R3.

### Requirements

**Policy**

- R1. Every assertion inside an `if (import.meta.vitest)` block is `expect(...).toMatchInlineSnapshot(...)` carrying authored expected content. No other `expect` terminal, no `expectTypeOf`, no `node:assert`, no `throw`-as-assertion, no other assertion channel. An empty `toMatchInlineSnapshot()` placeholder is never committed.
- R2. An in-source block references no binding its own module exports.
- R3. No hand-written property-testing construct appears inside an in-source block: no `it.prop` / `it.effect.prop` / `test.prop` calls, no `FastCheck` / `fc` / `Arbitrary` references, no fast-check imports. Generated-law registrations (`ruleOfSchemas(...)`) are exempt per KD4.

**Enforcement**

- R4. R1 and R3 are enforced by a new oxlint rule `in-source-test-snapshot-only` in `@systemfsoftware/oxlint-plugin-test-placement`, registered in its recommended set at `error`, reaching every package through the effect-dmmf bundle and the `all` preset. The rule keys on the `import.meta.vitest` guard in the linted file's own AST — never on filename labels — and carries RuleTester known-bad cases that prove each arm can fail.
- R5. All 25 in-source test files from the 2026-09-01 census conform to R1–R3 or are removed.

**Doctrine**

- R6. No live doctrine text routes kernel/policy/schema property suites into in-source blocks. CONCEPTS.md, the root AGENTS.md rules table, and the test-placement package's README and message strings state the snapshot-only policy with the generated-laws exclusion.

### Success Criteria

- The new rule is observed red against the pre-migration tree and green repo-wide after migration, in the implementing session's own transcript.
- `grep`-level audit: zero `it.prop`, `FastCheck`, `Arbitrary`, non-snapshot `expect(...)` terminals, `node:assert` imports, and empty `toMatchInlineSnapshot()` placeholders inside `import.meta.vitest` blocks across `packages/`, `omp/`, `agent-plugins/`.
- `pnpm check:local` exits 0 with the rule enabled at `error`.

### Scope Boundaries

**Deferred to Follow-Up Work**

- The `place-tests`, `architect-property-tests`, and `choose-test-layer` skill texts sanction in-source property tests over private helpers and live in the external skill store, not this repo. Their update is tracked as a residual, not edited here.
- The vendored constitution (`repos/constitution/`, symlinked at the root) is read-only per REPO-S3; aligning Article III with this policy is an upstream change in the constitution repo.
- `turbo.json` references guard scripts that do not exist in this tree (`check-workflow-test-adjacency.mjs`, `check-lint-coverage`); that staleness is unrelated to this policy.

**Outside this product's identity**

- Changing the property-testing plugin's rules for `*.property.test.ts` files — they govern a channel this plan leaves untouched.
- Authoring new property suites to backfill deleted in-source coverage. Deletion is the policy; a workflow whose exported contract lacks property coverage is a separate, admissibility-gated decision.
- Banning `node:assert` or other assertion channels in test files outside in-source blocks — R1 scopes the vocabulary ban to the in-source channel.

### Open Questions

All deferred; none block implementation.

- Q1 (deferred). Aliased assertion channels inside an in-source block (`const e = expect; e(x).toBe(1)`) evade canonical-identifier matching. Accepted boundary: the plugin family's OX-CI1 doctrine matches canonical spellings only, and an unguarded or alias-guarded block also escapes `isVitestGuard` — a limitation the new rule shares with the existing `in-source-test-targets-private` family.
- Q2 (deferred). Whether decisions stranded by U2's deletions (the Gen.ts generator properties are the known case) earn property suites at their workflow's exported contract is a separate admissibility-gated decision per file, not part of this migration.
- Q3 (deferred). The migration window between U1 (rule red on trunk state) and U2–U4 (migration) lives inside one PR; trunk never carries the red state, so no interim doctrine note is written.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **The rule lives in the test-placement plugin and reads only the linted file's AST.** It reuses the existing `isVitestGuard` detection from `in-source-test-targets-private.ts` and walks the guard's consequent. Per the repo's rule-authoring doctrine (OX-TS2), no disk reads: a rule keyed on the guard is falsifiable from RuleTester fixtures alone, and a label-routed rule cannot fail on the case it targets because the author can omit the label. Canonical-identifier matching only, per OX-CI1 — alias evasion is the family's accepted boundary (Q1).
- KTD2. **`toMatchInlineSnapshot` is the sole sanctioned assertion terminal, and its content is authored, not captured.** External `.snap` files under `src/` would be a new file-sprawl form no placement rule sanctions; inline snapshots keep the test bytes inside the module, which is the premise of the in-source channel. The author hand-writes the expected literal from the case's stated intent; running the suite then verifies code against the authored spec. Capture-then-commit — writing `toMatchInlineSnapshot()`, letting vitest fill it, committing unreviewed — is the banned workflow, and the rule reports the empty placeholder so the capture shape is lint-visible. `toMatchSnapshot` and `toMatchFileSnapshot` are banned in-source alongside every other terminal.
- KTD3. **In-source property suites are deleted, not relocated.** Their targets are private helpers; an external property file would force exporting those helpers, defeating KD2. The Property cell doctrine already grants authored property tests only at the workflow's exported contract; coverage of private helpers at composition altitude is the standing answer. Blocks whose deletion strands coverage of a real decision (the Gen.ts generator properties are the known case) are named in the PR description so the loss is reviewed, not silent.
- KTD4. **Snapshot conversion is an authored re-bless, and the dishonest shape is gated.** Every converted snapshot's literal is hand-written from the case's intent and read against the surrounding code before commit; a captured output that does not match intent means the code or the conversion is wrong, and the block is deleted instead. The review discipline is prose (canon: blessing hides the regression), but its cheapest evasion — the empty placeholder vitest would fill at capture time — is a lint error under R1, so capture-then-commit cannot pass the gate.
- KTD5. **The rule lands in its own commit, before the migration commits.** The test-placement package is an Evaluator surface for this policy: its change never shares a commit with the work it judges, and the gate is observed red between the rule commit and the migration commits, then green repo-wide after them. Both observations are recorded in the session transcript.

### High-Level Technical Design

Rule shape (directional, not implementation specification):

```text
in-source-test-snapshot-only (test-placement) — scope: the guard consequent of
if (import.meta.vitest …) in a src/ module, detected via isVitestGuard
├─ arm property-ban        — report it.prop / it.effect.prop / test.prop call sites;
│    FastCheck / fc / Arbitrary identifier references; fast-check imports.
│    ruleOfSchemas(…) call sites are NOT matched (KD4 — generated-law channel).
├─ arm snapshot-only       — report expect(…) member calls whose terminal ≠
│    toMatchInlineSnapshot; expectTypeOf calls; toMatchSnapshot / toMatchFileSnapshot
│    terminals; node:assert imports; ThrowStatement used as an assertion
└─ arm no-empty-placeholder — report toMatchInlineSnapshot() with no argument
```

Registration flow: `test-placement/src/rules/` → plugin `index.ts` `recommendedRules` at `error` → `effect-dmmf` one-shot bundle spreads it → `all` preset applies it to every package's `pnpm lint` inside `pnpm check:local`. No per-package config change is needed; no package currently sets `cellsRequiringTest`, so the existing presence arm of `src-property-test-cell` is dormant and unaffected. Messages follow the family formats (OX-EF1 four-placeholder shape; OX-EF2: each fix text names deletion as a reachable outcome).

### Census baseline (2026-09-01)

25 genuine in-source test files exist; all test non-exported symbols except one. Zero use snapshots today.

| Group                                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Blocks                                                                                                                                       | Disposition                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Property constructs (17 file entries)   | `packages/core/effect/cell/gen/src/Gen.ts`; `packages/core/effect/daemon-spec/src/Backoff.ts`, `DaemonHealth.schema.ts`, `DaemonPolicy.schema.ts`, `LeaderLock.ts`, `internal/RestartDecision.schema.ts`, `internal/RestartDecision.workflow.ts`; `packages/core/effect/schema/bounded-union/src/BoundedUnion.ts`; `packages/core/effect/schema/law/src/RuleOfSchemas.ts` (mixed — its `ruleOfSchemas('SelfCheck', …)` generated-law call survives per KD4); `packages/core/hex/hex-schema/src/ColonHex.schema.ts`, `HexBytes.schema.ts`, `HexString.schema.ts`, `PrefixedHex.schema.ts`, `StrictHex.schema.ts`, `Uint8arrayFromPrefixedHex.schema.ts`; `omp/plugins/omp-claude-compat/src/hooks/hooks.ts`, `hooks.workflow.ts` | `it.prop` / `it.effect.prop` over private helpers; the 6 hex-schema files also carry `expectTypeOf`, deleted with the block (A2)             | Delete hand-written blocks/parts (U2)             |
| Example-only assertion blocks (8 files) | `packages/core/effect/daemon-spec/src/internal/Intensity.ts`, `internal/IntensityWindow.ts`; `packages/core/effect/schema/law/src/RuleOfSchemas.ts` (example part); `packages/testing/mutation/stryker-js/cli/src/Output.ts` (2 blocks); `packages/testing/mutation/stryker-js/platform-node/src/IncrementalDiff.workflow.ts`, `Project.ts`; `packages/testing/specs/gherkin/effect/src/Feature.ts`, `FeatureRuntime.ts`                                                                                                                                                                                                                                                                                                        | `expect(...)` value assertions, mostly inside `it.effect` Effect.gen sequences; `Feature.ts` pins runner-identity via `toBe(it.effect.skip)` | Convert per disposition categories or delete (U3) |
| Exported-symbol target (1 file)         | `packages/core/effect/schema/discovery/src/internal/schema-names.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | tests exported `findExportedSchemaNames`; passes today's private-target gate only through `void` references to private bindings              | Delete the block (U4)                             |

### Assumptions

- A1. "Snapshot tests" means `toMatchInlineSnapshot`; no other snapshot form is in-source-compatible (KTD2).
- A2. `expectTypeOf` type-level assertions are not snapshot tests and leave in-source blocks under the strict reading of the policy. In the hex-schema files they are deleted together with the property block that contains them; type-level contracts remain gated by typecheck, attw, and api-extractor, which is where type assertions belong.
- A3. Deleted private-helper property coverage is not backfilled in this work (KTD3); a mutation-score movement is evaluated from the advisory CI Mutation report, not pre-emptively.
- A4. Packages whose only change is in-source test bytes ship a `.changeset` at bump `none` — tsdown's `define` strips the blocks from dist, so no published artifact changes; the lint plugin carrying the new rule ships a feature bump. Packages gaining `toMatchInlineSnapshot` calls declare `@vitest/snapshot: catalog:` per the doctrine recorded in `docs/plans/2026-08-29-001-fix-declare-vitest-snapshot-deps-plan.md`.

---

## Implementation Units

### U1. Rule `in-source-test-snapshot-only` and lint-package doctrine text

**Goal:** The policy has a deterministic gate; the lint package's own texts no longer route property suites in-source.
**Requirements:** R1, R3, R4, R6 (message strings)
**Dependencies:** none
**Files:**

- `packages/lint/oxlint/plugins/testing/test-placement/src/rules/in-source-test-snapshot-only.ts` (create)
- `packages/lint/oxlint/plugins/testing/test-placement/src/rules/in-source-test-snapshot-only.config.ts` (create: Options, message constants, `meta` — mirror the sibling rule pair shape)
- `packages/lint/oxlint/plugins/testing/test-placement/src/rules/__tests__/in-source-test-snapshot-only.test.ts` (create)
- `packages/lint/oxlint/plugins/testing/test-placement/src/index.ts` (register rule + recommended at `error`)
- `packages/lint/oxlint/plugins/testing/test-placement/src/rules/path.config.ts` (comment doctrine: kernel/policy/schema suites no longer become in-source blocks)
- `packages/lint/oxlint/plugins/testing/test-placement/src/rules/src-property-test-cell.config.ts` (`UNSANCTIONED_CELL_FIX` text: stop routing suites to in-source blocks)
- `packages/lint/oxlint/plugins/testing/test-placement/README.md` (rule table row)
- `packages/lint/oxlint/plugins/testing/test-placement/etc/oxlint-plugin-test-placement.api.md` (regenerate via the package's api:update flow after the new export lands)

**Approach:**

1. Author the rule per KTD1/KTD2 with the three arms in the High-Level Technical Design, reusing `isVitestGuard` and the sibling rules' `defineRule` + config-pair + message-constant conventions.
2. Register in `index.ts` `recommendedRules` at `error` so it flows through effect-dmmf to the `all` preset.
3. Rewrite the two doctrine strings that currently tell authors to convert kernel/policy/schema suites into in-source blocks.
4. Rebuild the plugin and regenerate its api.md report so `api:check` stays green (the new rule is a new public export on the plugin's default object).

**Patterns to follow:** `in-source-test-targets-private.ts` (guard detection, private-binding collection), `no-io-module-in-source-test.ts` (block-scoped arm), `src-property-test-cell.test.ts` (RuleTester naming: `Should_[Behavior]_When_[Condition]`), OX-EF1/OX-EF2 (message shape, deletion-reachable fixes), OX-CI1 (canonical identifiers only, near-miss fixtures prove aliases do not fire).

**Test scenarios:**

- Happy path: an in-source block whose only assertions are `expect(...).toMatchInlineSnapshot(\`…\`)` with authored content stays silent.
- Happy path: a gherkin-spec `describe`/`it` structure with snapshot assertions stays silent (runner calls are not assertions).
- Happy path: a `ruleOfSchemas('Name', schema)` generated-law call inside the block stays silent (KD4).
- Error: `it.effect.prop(...)` inside the block reports the property-ban arm.
- Error: `FastCheck` / `fc` / `Arbitrary` reference inside the block reports the property-ban arm.
- Error: `expect(x).toBe(y)` inside the block reports the snapshot-only arm.
- Error: `expect(x).toMatchSnapshot()` or `toMatchFileSnapshot(...)` inside the block reports the snapshot-only arm (KTD2).
- Error: `expectTypeOf<...>()` inside the block reports the snapshot-only arm.
- Error: `import('node:assert')` (or `node:assert/strict`) inside the block reports the snapshot-only arm.
- Error: a `ThrowStatement` inside a test body in the block reports the snapshot-only arm (throw-as-assertion).
- Error: `expect(x).toMatchInlineSnapshot()` with no argument reports the empty-placeholder arm (KTD2/KTD4).
- Valid: the same constructs outside an `import.meta.vitest` guard (e.g. in a `*.property.test.ts` file) stay silent.
- Valid near-miss: an aliased `expect` (`const e = expect`) does not fire any arm (OX-CI1 canonical-only boundary, Q1).

**Verification:** RuleTester suite green for this rule; the plugin's `api:check` green after regeneration; then the full-repo lint is run once and observed RED on the census files — the red output is recorded as the gate's known-bad evidence.

**Execution note:** This unit is its own commit (KTD5). Do not migrate any census file in this commit.

### U2. Delete hand-written in-source property-test blocks

**Goal:** No in-source block contains a hand-written property-testing construct.
**Requirements:** R3, R5
**Dependencies:** U1
**Files:** the 17 property-group file entries in the census table

**Approach:**

1. Delete each property-based in-source block in full, including now-unused dynamic imports and the hex-schema blocks' `expectTypeOf` assertions (A2). Test code only — never the module's exported definitions; `RuleOfSchemas.ts` keeps its exported `ruleOfSchemas` function untouched and its in-source `ruleOfSchemas('SelfCheck', …)` generated-law call stays (KD4).
2. In `RuleOfSchemas.ts`, delete only the hand-written parts: the `lawsOf`-based example assertions are U3's, the property constructs are this unit's; the block survives if the SelfCheck registration remains.
3. Do not backfill coverage (KTD3, Scope Boundaries). Blocks whose deletion strands coverage of a real decision are named in the PR description for review.

**Test expectation: none — this unit deletes tests; the observable contract is the lint gate's property-ban arm going green on these files and the packages' remaining suites passing.**

**Verification:** `pnpm check:local` green for each touched package; the property-ban arm reports nothing repo-wide.

### U3. Convert example-based in-source blocks to authored inline snapshots

**Goal:** The surviving hand-written in-source blocks pin authored intended output.
**Requirements:** R1, R5
**Dependencies:** U1
**Files:** the 8 example-group files in the census table; `package.json` of each package gaining `toMatchInlineSnapshot` (add `@vitest/snapshot: catalog:` per A4)

**Approach:**

1. Spike first, on one file: author one inline snapshot by hand inside an in-source block and run the package's suite. Confirm the snapshot matcher runs under the repo's includeSource + dynamic-import guard shape and that an authored literal mismatch fails the test. If the matcher cannot run there, stop the pipeline — KD1's mechanism is broken, not merely inconvenient.
2. Per block, classify and act:
   - Deterministic value assertions (e.g. `RuleOfSchemas.ts`'s `collapsed.roundTrips('kept')` booleans): convert each terminal to `toMatchInlineSnapshot` with the literal hand-written from the case's stated intent, then run the suite to verify code matches the authored spec (KTD2).
   - Stateful Effect sequences (`Intensity.ts`, `IntensityWindow.ts`, `FeatureRuntime.ts`, `Project.ts`, `IncrementalDiff.workflow.ts`, `Output.ts`): convert per case only when the pinned literal is the case's whole point and the sequence is deterministic (TestClock-driven flows qualify); delete the case when the assertion encodes sequencing behavior rather than an output value.
   - Identity/pointer assertions (`Feature.ts`'s `toBe(it.effect.skip)` runner-identity checks): delete — a snapshot of a function's identity is a name tautology, and the selectors are exercised at composition altitude by every gherkin run in those modes.
   - Tautology blocks (assertions restating a constructor or an obvious transform): delete.
3. Keep blocks at module level and private-only (R2 already holds for all 8).

**Test scenarios:** the converted snapshots are the tests; each authored literal is read against the code's intent before commit, and a run that disagrees with the authored literal routes to investigation, never to re-blessing (KTD4).

**Verification:** packages' suites pass; the snapshot-only and empty-placeholder arms report nothing on these files; every written snapshot literal is accounted for per file in the commit message.

### U4. Delete the exported-symbol in-source test

**Goal:** `schema-names.ts` carries no in-source coverage of its exported `findExportedSchemaNames`.
**Requirements:** R2, R5
**Dependencies:** U1
**Files:**

- `packages/core/effect/schema/discovery/src/internal/schema-names.ts` (delete the in-source block)

**Approach:**

1. Delete the in-source block in full. Relocation is not available: the package has no `tests/` directory, `tests-import-public-api` bans test files from reaching `src/internal/`, and the symbol is not on the package's public surface (`mod.ts` re-exports `findExportedSchemas`, not the name extractor).
2. Record the coverage posture in the commit message: the pure decision is exercised at composition altitude through `findExportedSchemas`' directory walk and the schema-laws generation pipeline that consumes it.

**Test expectation: none — deletion; the block's coverage has no policy-compliant home (OX-EF2: the fix ends in deletion).**

**Verification:** `in-source-test-targets-private` and the new rule both report nothing on this package; package suite green.

### U5. Doctrine entries, root rule row, and changesets

**Goal:** The window-level doctrine matches the gate; release intents exist.
**Requirements:** R6
**Dependencies:** U1 (which owns the lint-package-local doctrine text), U2–U4 (so the doctrine never describes an unenforced state); U5 touches only CONCEPTS.md, AGENTS.md, and `.changeset/`
**Files:**

- `CONCEPTS.md` (rewrite the **Property cell** entry: in-source blocks are authored inline snapshots over private symbols plus the generated schema-law channel; property tests live only at the workflow's exported contract; add a short **Snapshot spec** entry under Test execution)
- `AGENTS.md` (one row in the "Rules — Must Hold At Done" table, in the table's existing ID / Rule / Gate shape: hand-written in-source tests are authored inline snapshots over non-exported symbols, generated schema laws excluded; gate = `in-source-test-targets-private` + `in-source-test-snapshot-only` via `pnpm check:local`)
- `.changeset/` intents via `pnpm change` (feature bump for the lint plugin; `none` for test-byte-only packages per A4)

**Approach:**

1. CONCEPTS.md edits follow its existing entry format; a doctrine term whose meaning an entry already carries is a refinement, not a new heading.
2. The AGENTS.md row names both in-source gates and nothing else — the lint failure is loud on its own.

**Test expectation: none — documentation and release-intent metadata.**

**Verification:** `pnpm check:local` green repo-wide at the branch tip and observed as such; changeset files parse (`pnpm change` wrote them).

---

## Verification Contract

| Gate                | Command                                                                                                                                                               | Proves                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Rule falsifiability | `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test`                                                                                                    | U1's RuleTester known-bad cases report; known-good stay silent                 |
| Gate red-then-green | repo-wide lint after U1, then repo-wide lint after U2–U4                                                                                                              | rule observed failing on the pre-migration tree, then passing repo-wide (KTD5) |
| Full local gate     | `pnpm check:local` (run after the last edit, per REPO-D1)                                                                                                             | lint, typecheck, tests, attw, api:check green with the rule at `error`         |
| Policy audit        | grep for `it.prop` / `FastCheck` / `Arbitrary` / `node:assert` / non-snapshot `expect` terminals / empty `toMatchInlineSnapshot()` inside `import.meta.vitest` blocks | zero hits across `packages/`, `omp/`, `agent-plugins/`                         |
| Mutation posture    | advisory Mutation workflow report in CI                                                                                                                               | score movement after property-suite deletion is reviewed, not assumed          |

## Definition of Done

- Every unit's verification ran in the implementing session and is recorded.
- The new rule is registered at `error` and was observed red before migration and green repo-wide after.
- Zero in-source hand-written property constructs, zero non-snapshot in-source assertion channels, and zero empty inline-snapshot placeholders remain (R1–R3 hold repo-wide); generated-law registrations survive untouched (KD4).
- Doctrine texts no longer route property suites in-source (R6).
- Changesets present per REPO-R2 and A4; commits respect the Evaluator/Editable split (KTD5).
- No abandoned-attempt code, dead imports from deleted blocks, or obsolete snapshot content left in the diff.
