---
title: Strict enrollment — the 19 ex-base packages onto the canonical root, and the death of oxlint-config - Plan
type: refactor
date: 2026-09-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-plan
execution: code
---

# Strict enrollment — the 19 ex-base packages onto the canonical root, and the death of oxlint-config - Plan

## Goal Capsule

- **Objective:** Each of the 19 ex-base consumers stops parking on the transitional preset: it drives its measured red set to zero by code fixes, then flips `extends: [base]` → `extends: [all]` + `defaultIgnores` as that package's final commit — except an evaluator-surface consumer, which flips to `[instrument]` instead. Then `@systemfsoftware/oxlint-config` is deleted whole. After this plan the tree ships **two** lint declaration surfaces: `@systemfsoftware/oxlint-preset`'s two roots and each consumer's own `oxlint.config.ts`.
- **Owner:** Repo maintainers, via an autonomous LFG-style run (one PR per package, watched to green).
- **Trigger:** Immediately after Delivery B of `docs/plans/2026-09-12-0311-refactor-composable-oxlint-presets-plan.md` lands. This plan is the death-date the parent's KD7 attaches to the transitional `base`.
- **Acceptance:** every ex-base consumer flipped to its classified root (`all` for product, `instrument` for evaluator surface — see U0b) with no `base` reference remaining; `@systemfsoftware/oxlint-config` deleted and resolved by no manifest (F4's gate); the zero-`warn` grep gate green (F2's gate); `pnpm check:local` green after each flip and at the end.
- **Means:** per-package fix-then-flip (F1); the strict **red-set dry run** is this plan's first evidence unit — no package is flipped before its own red set is measured and its rule ids dispositioned.
- **Evidence rule:** every acceptance claim is a command that ran, per the CE-unified contract; "flipped" without a before-red and after-green pair is a claim, not evidence.

### Authority and grounding

- **Contract:** the parent plan's F1–F4 (its binding follow-up contract, quoted verbatim under Requirements).
- **Rule-set authority:** the endgame article draft (`/tmp/endgame`, 2026-09-12, user-authored) — its `check:` columns determine each disposition.
- **Inventory:** `docs/census/oxlint/CENSUS.md` (measured, digest-pinned) — every rule id and count in the disposition table traces to it.
- **Doctrine (wiki, this repo's own corpus):** `warn-never-rests` — a check ships day-one as `error` or does not ship; the ban is a `posit` whose stated falsification condition is a measured staged warn-then-error regime that beats day-one error on net violation rate (unmeasured in the corpus). `incremental-adoption-topology` — escalating config tiers consumed via `extends` are the native adoption mechanism, with severity `error`, never `warn`.
- **Counter-doctrine (web, primary):** Minotto, _Deprecate. Fix. Enforce. Repeat._ (`http://emanueleminotto.github.io/blog/dfer`) — the staged `warn` → clean-as-you-touch → `error` ladder with a frozen warning-count baseline. It is the opposing pole; this plan rejects it under KD2 and records the wiki's falsification condition rather than pretending the disagreement is settled.
- **Enforcement discipline:** `CONSTITUTION.md` — CONST-E9/CONST-E8 (the maker never edits the evaluator), CONST-W3 (the only legal bypass), CONST-S4 (delete over salvage).

---

## Product Contract

### Summary

The composable-presets change leaves two permanent preset roots and one transitional survivor. `base`, re-derived from the ten leaf fragments, still carries the 19 ex-base consumers at today's strength; every consumer config in the tree that is not a stryker-family `all` consumer resolves it. This plan executes that survivor's death: measure each parked consumer's red set against its classified strict root, fix the red by code, flip the consumer, and finally delete `@systemfsoftware/oxlint-config`.

The strict root is unconditional (F2). There is no `warn` tier, no allowlist, no baseline; a consumer that cannot reach zero red does not stay on `base` — its non-conformant code travels one of F3's four exits. A fifth outcome — leaving it parked — is what this plan exists to forbid.

### Problem Frame

Three measured facts make this a plan rather than a chore.

1. **The red set is unmeasured.** The census reports that a rule exists, not where it fires (`CENSUS.md`, "Gaps against this census": per-rule event counts are not measured). Nothing establishes how much code stands between the 19 consumers and the strict root, which rules carry the bulk of it, or which consumers are cheap to flip. The dry run (U0) turns that unknown into a queue ordered largest-red-first.
2. **The parked consumers do not see the whole ruleset.** `base` registers `oxlint-plugin` and `effect-dmmf`; it does not register `cell-vocabulary` or `effect-entrypoint`, so no package in the tree runs the cell-vocabulary rule or the entrypoint quartet (`CENSUS.md` §6, "Delivery asymmetry"). Flipping to `all` makes those five rules fire in the ex-base consumers for the first time — a red source with no precedent to size it.
3. **The flip set is not homogeneous.** At least one ex-base consumer is evaluator surface: `packages/oxlint-plugin/all/oxlint.config.ts` — the preset package itself — extends `base` today (measured). The parent created the instrument root precisely for the oxlint-plugin subtree (`packages/oxlint-plugin/oxlint.config.ts` → `extends: [instrument]`, parent R7); a blanket flip to `all` would lint the preset's own source with the strict product root and leave that consumer in the wrong topology. The flip target is a classification, not a constant.

### Key Decisions (session-settled)

- **KD1. F3's four-disposition ladder is binding, and it is the only exit.** Non-conformant code resolves through **fix** (default), **declare** (CONST-W3 in the PR — the sole legal bypass), **reclassify** (evaluator-surface code moves to `instrument`), or **delete** (CONST-S4). `declare` is a named, per-PR, reviewed statement of a breach — never a per-package exemption file. (Inherited from parent F3; adopted because F3's exits are what make F2 achievable without a hatch.)
- **KD2. Strictness is unconditional at `error` (F2).** No `warn` literal, no allowlist, no baseline. This rejects the DFER staged ladder and its frozen warning-count baseline explicitly: `warn-never-rests` measures warning decay (16% fixed in FindBugs' Fixit week; fixed warnings averaged 5 months old against 9 for open ones) and bans `warn` as a resting severity; its falsification condition — staged warn-then-error beating day-one error on net violation rate — is unmeasured. The ban outruns its bedrock and is carried as such. (Inherited from parent F2/KD3/ENFORCE-L5; the wiki grounding and the counter-doctrine are recorded here because a plan that claims a universal ban should name its unmeasured premise.)
- **KD3. Evidence before flips.** The red-set dry run lands as its own unit, before any flip, and each consumer's pre-flip red set is recorded in that consumer's PR. A flip without a recorded before-red is not evidence. (Derived from CONST-E7 and the parent's "the strict red-set dry run is that plan's evidence step".)
- **KD4. Every flip is one commit, and the flip is the last one.** Fixes land first; the `extends:` change lands alone, so the red diff and the green diff are separately auditable and the flip reverts without reverting the fix. (Derived from parent F1's "own commits" + "flips … as its final commit".)
- **KD5. The flip target is classified before it is assigned.** A consumer flips to `all` only if it is product code; an evaluator-surface consumer flips to `instrument`. The classification is part of U0b's evidence, not a judgment made at flip time. (Derived from the Problem Frame's fact 3 and the parent's KD4/R7.)
- **KD6. The disposition table is a record, not an authorization.** It states what the deferred article-consolidation plan inherits; nothing in it is executed by this plan. The only evaluator edits this plan makes are `base`'s deletion (F4) and each consumer's own `extends` line — a rule change the table calls for is a proposal to the instrument owner, never a self-serve edit (CONST-E9). (Parent U0(c)/KD6 + CONST-E8.)

### Requirements

Verbatim from the parent plan's binding follow-up contract; the gates are part of each requirement.

- **F1.** Fix-then-flip, package by package: each of the 19 ex-base packages drives its measured red set to zero by code fixes (own commits), then flips `extends: [base]` → `extends: [all]` + `defaultIgnores` as its final commit. Largest-red packages first. Gate: per-package lint green before and after its flip.
- **F2.** Canonical strictness is unconditional at `error` — complexity ceilings (`max 2` on `**/src/**`, `max 1` on `**/src/**/*.workflow.ts`, `variant: modified`, off for test files), `no-ternary`, `typescript/switch-exhaustiveness-check`, `no-restricted-imports`, the full defect tier. No `warn` literal, no allowlists, no baselines anywhere (KD3, ENFORCE-L5). Gate: grep `': 'warn'` over `packages/**/oxlint.config.ts` and the preset sources returns 0.
- **F3.** Non-conformant code resolves through exactly four dispositions, in order — **fix** (default; complexity/no-ternary extraction toward small pure functions, `node:*` → `@effect/platform`, the strict trio is type hygiene), **declare** (CONST-W3 in the PR — the only legal bypass), **reclassify** (evaluator-surface code moves to `instrument`), **delete** (CONST-S4). Article rules are self-gating (Cell descriptions, `*.workflow.ts`, `*.schema.ts`), so the delta an ex-base package inherits is the enumerable non-self-gating set: two complexity ceilings, `no-ternary`, `switch-exhaustiveness-check`, `no-unnecessary-condition`, `strict-boolean-expressions`, `no-restricted-imports`, the test-file vitest tier.
- **F4.** `@systemfsoftware/oxlint-config` is deleted after the last flip (KD2). Gate: no manifest resolves it; repo-wide audit that no hatch exists — every surviving exception a CONST-W3 declaration named in its PR.

F1's "flips … → `extends: [all]`" is read with KD5: an evaluator-surface consumer's flip target is `instrument` (the parent's own R7 target for the subtree), because F1's subject is the ex-base **consumer**, not a claim that every ex-base consumer is product code.

### Scope Boundaries

In scope: F1–F4, the red-set dry run, the flip-target classification, the per-consumer flips and their code fixes, `base`'s deletion, the zero-`warn`/no-hatch audit, the disposition table (KD6).

Out of scope, deferred to their own plans:

- Article consolidation of the ten leaves into endgame-article packages; the disposition table is its input.
- The 13 `new-rule` rows (the parent enumerates the same set as CELL-L2/L4/L10/M1, CORE-BND1/D3, SURF-AFF1/INT1, STORE-CAP1/ENC1, PROD-CFG1).
- The 5 `demote-to-import-graph` rows and the 3 `promote-to-tsc` rows — they leave the lint set, and building their replacement instruments is not this plan's work.
- Rule semantics/messages/options (moves are 1:1), the stryker-js fork's own packages beyond their config's `extends` target, and mutation-cell topology.

**Evaluator-surface discipline (CONST-E9/CONST-E8).** `base`'s deletion, the canonical/instrument roots, the `defaultIgnores` export, and every gate script are evaluator surfaces. Their edits land in standalone commits by the instrument owner, never inside a consumer's fix commit; a consumer that needs the instrument changed is a proposal, not a self-serve edit. The dry run measures with a throwaway probe config and edits nothing.

---

## Rule Disposition Table

Authored here per parent U0(c)/KD6: the input the deferred article-consolidation plan needs, and per KD6 a **record, not an authorization** — nothing below is executed by this plan.

**Coverage.** Every rule id the census registers gets exactly one disposition: the 65 distinct custom rule ids across the ten leaves (the census's per-leaf tables), the preset root's own three stock configuration entries, and the recommended package's 25 stock ids (8 families, as the census groups them). The endgame laws with no current implementation are listed in a second table.

**Counting basis (derived, not measured).** The census headline reports 150 distinct registered rule ids "at the source layer"; that number counts namespaced re-keys. Its per-leaf tables enumerate 65 distinct custom rules; the two aggregates re-key 60 of them (19 + 41), giving 125 registered custom ids, plus the recommended package's 25 stock ids = 150. The counts in this section are arithmetic over the census's own tables, marked derived; the census's headline is the measured figure and is not re-measured here.

### Method

Dispositions derive from the endgame draft's `check:` columns, in this authority order:

| Disposition                | Assigned when the endgame law's `check:` says…                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **keep**                   | the law is lint-enforced and this rule is its mechanism — _or_ the rule is a law-independent defect-tier rule (the instrument class parent KD4 names) with no endgame law to state it      |
| **rescope**                | a law survives and stays lint-enforced, but this rule's selection or verdict does not match the law's boundary (file set, phase, published surface)                                        |
| **delete**                 | no endgame law grounds the rule and it is not a law-independent defect (style preference, whitelist, fires on correct code) — _or_ the endgame's own mechanism proscribes the rule's shape |
| **promote-to-tsc**         | the law's `check:` is the type-checker/compiler; enforcement leaves the lint set for the type system                                                                                       |
| **demote-to-import-graph** | the law's `check:` is import-graph lint or a deterministic command (boundary audit, rollup/export-map gate, CI `--deny-warnings`)                                                          |
| **new-rule**               | the endgame names a law whose `check:` names a lint rule with no implementation in the census                                                                                              |

Rows are grouped by the endgame article grounding them; the census family (owning leaf) is named in the rule column so a row resolves against `CENSUS.md` without cross-referencing.

### Article 01 — The Authored Unit (`/tmp/endgame/01-authored-unit.md`)

UNIT-P1 is the purity law; its check is split — "import-graph lint bans platform/I/O imports in core decision files; oxlint bans side-effect calls". The oxlint half is what `effect-native` implements today, and today it fires on every Effect-importing file, wider than the law's `decide` boundary.

| Rule (leaf)                                     | Enforces                             | Disposition | Endgame grounding                                                                              |
| ----------------------------------------------- | ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| `effect-native/no-date-now-in-effect`           | `Date.now()` banned in Effect code   | **rescope** | 01 UNIT-P1 — "read clocks…inside `decide`"; bind to core decision files, not every Effect file |
| `effect-native/no-native-setinterval-in-effect` | `setInterval` banned in Effect code  | **rescope** | 01 UNIT-P1 — side-effect calls in `decide`                                                     |
| `effect-native/no-native-settimeout-in-effect`  | `setTimeout` banned in Effect code   | **rescope** | 01 UNIT-P1 — side-effect calls in `decide`                                                     |
| `effect-native/no-new-promise-in-effect`        | `new Promise` banned in Effect code  | **rescope** | 02 CONST-B2 — "no eager async result on the public surface"; bind to the published surface     |
| `effect-native/no-logging-in-catch`             | no logging in an Effect catch block  | **delete**  | ungrounded (CONST-B2's check names the public-surface law, not catch bodies)                   |
| `effect-native/no-native-map-in-effect`         | `new Map` banned in Effect code      | **delete**  | ungrounded (no endgame law names native collections; census: a style rule)                     |
| `effect-native/no-native-set-in-effect`         | `new Set` banned in Effect code      | **delete**  | ungrounded (same)                                                                              |
| `effect-native/no-new-worker-with-wasm-import`  | no `new Worker` beside a WASM import | **delete**  | ungrounded; census: recommended by no preset                                                   |

### Article 02 — The Cell (`/tmp/endgame/02-cell.md`)

CELL-L6 ("Run Only When R Is Never") is the endgame's single-interpretation-edge law; the entrypoint family is its lint projection.

| Rule (leaf)                                       | Enforces                                                       | Disposition                | Endgame grounding                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `cell-vocabulary/no-io-in-phase-bodies`           | no I/O reachable from a pure phase body                        | **keep**                   | 01 UNIT-P1 (phase purity) + 02 channel invariants; check is oxlint over `Cell.vocabulary` projections               |
| `effect-entrypoint/entrypoint-interprets-once`    | exactly one interpretation edge per `main.ts`                  | **keep**                   | 02 CELL-L6 — "interpreted exactly once at the process edge"; 09 checklist "single `Cell.run` at process entrypoint" |
| `effect-entrypoint/entrypoint-no-promise-wrapper` | `main.ts` never wraps a foreign promise runtime                | **keep**                   | 02 CONST-B2 — no eager async result                                                                                 |
| `effect-entrypoint/entrypoint-no-exports`         | `main.ts` exports nothing                                      | **rescope**                | 02 CELL-L6 + 04 `main.ts` anatomy; reconcile the verdict with 10's root (`export const main`)                       |
| `effect-entrypoint/entrypoint-not-imported`       | nothing imports `main.ts`                                      | **demote-to-import-graph** | 02 CELL-L6 + 04 ("Engine internal files not in `mod.ts`") — the fact is an import edge                              |
| `structure/no-barrels`                            | no barrel files / barrel imports                               | **rescope**                | 05 SURF-BRL1 — "oxlint bans `export * as` in package **entrypoints**"; narrow the rule to that boundary             |
| `effect-workflow/workflow-match-exhaustive`       | workflow dispatch is exhaustive over the closed decision union | **keep**                   | 01 UNIT-P2 + 02 — one exhaustive dispatch over a closed type; the endgame's dispatch vocabulary                     |

### Article 03 — The Pure Core (`/tmp/endgame/03-pure-core.md`)

CORE-D2 ("oxlint flags non-tagged error structures") and CORE-D4 ground the error/tag families; CORE-D3 and CORE-BND1 name rules that do not exist yet.

| Rule (leaf)                                           | Enforces                                            | Disposition                | Endgame grounding                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `structure/ban-error-string`                          | no string coercion of error-like values             | **keep**                   | 03 CORE-D2 — "oxlint flags non-tagged error structures"; 09 prohibited-artifacts "String or boolean fields as error codes" |
| `effect-schema/ban-data-taggederror`                  | `Data.TaggedError` banned; use `Schema.TaggedError` | **keep**                   | 03 CORE-D2 + 02 E channel (failures are tagged variants)                                                                   |
| `effect-schema/no-manual-tag-member`                  | no hand-written `_tag` class member                 | **keep**                   | 02 channel A — "Unique discriminant `_tag` on every variant"; 03 CORE-D4                                                   |
| `effect-schema/no-manual-tag-property`                | no hand-written `_tag` property                     | **keep**                   | 02 channel A — same law                                                                                                    |
| `effect-schema/schema-filter-constructive-generation` | `filter` stays constructive for arbitraries         | **keep**                   | 03 (the `filter` example carries `arbitrary`) + 07 CONST-T14 — "the type is the generator"                                 |
| `effect-schema/schema-recursive-union-budget`         | a recursive union stays within its budget           | **keep**                   | 03 constructive generation — a generator that cannot terminate is a defect (law-independent)                               |
| `effect-schema/schema-declaration-location`           | schemas declared where the architecture puts them   | **keep**                   | 04 file topology — `TransferCommand.schema.ts`, declaration-only gate class                                                |
| `effect-schema/schema-file-exports-schemas-only`      | a schema file exports schemas and nothing else      | **keep**                   | 04 — "`.schema.ts` (declaration-only gate, codec laws)"                                                                    |
| `effect-schema/ban-effect-schema-imports`             | bare `@effect/schema` import banned                 | **demote-to-import-graph** | deterministic import-path fact (03/04 read `S.` from effect v4); belongs with the import instrument                        |
| `effect-schema/schema-checked-element-named`          | a `check`ed collection element is a named const     | **delete**                 | ungrounded (a combinator style rule; no endgame law states it)                                                             |
| `effect-workflow/make-body-purity`                    | a `Workflow.make` body stays pure                   | **keep**                   | 03 CONST-P1 / 01 UNIT-P1 — the pure core                                                                                   |

### Article 04 — Products (`/tmp/endgame/04-products.md`)

Art. 04's file/folder topology and the two surviving gate suffixes (`.schema.ts`, `.workflow.ts`) ground the workflow family; the rollup/export-map gate grounds the `internal` family; the Drifted Key law deletes every name-keyed rule.

| Rule (leaf)                                     | Enforces                                                  | Disposition                | Endgame grounding                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect-workflow/make-command-schema`           | the workflow's command is a schema                        | **keep**                   | 04 (the command is a schema) + 03 `Command → Decision`                                                                                                                          |
| `effect-workflow/make-file-location`            | `Workflow.make` in a single-segment `<stem>.workflow.ts`  | **keep**                   | 04 — `.workflow.ts` gate class, "at most one call per file"                                                                                                                     |
| `effect-workflow/workflow-file-export-topology` | the workflow file's export shape                          | **keep**                   | 04 file topology                                                                                                                                                                |
| `effect-workflow/workflow-file-make-presence`   | a workflow file contains a `Workflow.make`                | **keep**                   | 04 — the `.workflow.ts` gate class; the family's obligation rule (census OX-OB1)                                                                                                |
| `effect-workflow/damp-workflow-stem`            | workflow file stems follow the DAMP stem                  | **delete**                 | 04 — "Every other rule keys on content, not name… a name that a gate keys on un-enrolls the file on rename"                                                                     |
| `structure/internal-export-jsdoc`               | `internal/` exports carry a JSDoc `@internal` tag         | **demote-to-import-graph** | 04 — "the gate is the export map plus the rollup leak check — **never** the folder name"                                                                                        |
| `structure/no-internal-jsdoc-outside`           | no `@internal` outside an `internal` path segment         | **demote-to-import-graph** | 04 — same rollup/export-map gate                                                                                                                                                |
| `structure/no-io-boundary-tests`                | I/O boundary files get composition tests, not `*.test.ts` | **delete**                 | 07 CONST-T12 — "no linter or test runner rules that pick tests by filename suffix"; parent's deferred "label-routed filename routing → content-keyed re-derivation or deletion" |
| `structure/ban-classes`                         | every class except sanctioned Effect v4 idioms            | **delete**                 | ungrounded (needs a per-package whitelist; 05 SURF-AFF1 bans only Effect-returning methods — a new rule)                                                                        |
| `structure/no-inline-destructured-type`         | no inline `TSTypeLiteral` on destructured params          | **delete**                 | ungrounded; census: "fires on correct code"                                                                                                                                     |

### Article 05 — The Public Surface (`/tmp/endgame/05-public-surface.md`)

SURF-BRL1 grounds `no-barrels` (rescoped above). SURF-INT1, SURF-SHP1 and SURF-AFF1 name no existing rule and appear in the endgame-laws table.

### Article 06 — Stores (`/tmp/endgame/06-stores.md`)

| Rule (leaf)                                   | Enforces                                             | Disposition | Endgame grounding                                                                                    |
| --------------------------------------------- | ---------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `tag-discipline/no-context-generic-tag`       | `Context.GenericTag` banned; use `Context.Service`   | **keep**    | 02 Cell dependency stratification + 06 store RIGHT example — `Context.Service` is the sanctioned tag |
| `tag-discipline/no-direct-tag-access`         | no direct `_tag` access; use the Match API or guards | **keep**    | 01 UNIT-P2 (`Match.exhaustive`) + 02 exhaustiveness                                                  |
| `tag-discipline/no-either-tag-assertions`     | no Either `_tag` assertions in test files            | **rescope** | 07 CONST-T12 — classify by what a test imports and calls, never by filename suffix                   |
| `tag-discipline/no-bodyless-status-assertion` | an HTTP status assertion surfaces the response body  | **delete**  | ungrounded; census: needs a vocabulary only some packages have                                       |

### Article 07 — Verification (`/tmp/endgame/07-verification.md`)

CONST-T10 (independent oracles) and CONST-T14 (properties where the surface cannot reach) ground the property family; CONST-T12 deletes the directory/suffix family.

| Rule (leaf)                                      | Enforces                                        | Disposition | Endgame grounding                                                                  |
| ------------------------------------------------ | ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `property-testing/no-assert-in-property`         | a predicate never calls `expect`/`assert`       | **keep**    | 07 CONST-T10 — the oracle is not the SUT; a predicate returns a verdict            |
| `property-testing/no-silent-return`              | a predicate never returns without a verdict     | **keep**    | 07 CONST-T10 — verdict on every path (census OX-OB1 obligation rule)               |
| `property-testing/no-nested-quantification`      | no `fc.assert` inside a predicate               | **keep**    | 07 CONST-T14 — law-independent defect                                              |
| `property-testing/no-unbounded-fanout`           | no unbounded generation fan-out                 | **keep**    | 07 CONST-T14 — the generator law                                                   |
| `property-testing/prop-arbitrary-schema-origin`  | an arbitrary derives from a schema              | **keep**    | 07 CONST-T14 — "the type is the generator"                                         |
| `property-testing/prop-fixture-schema-origin`    | a fixture derives from a schema                 | **keep**    | 07 CONST-T10 — fixtures authored, not derived by running the SUT                   |
| `property-testing/prop-generated-law-duplicate`  | a generated law is not restated by a hand case  | **keep**    | 07 CONST-T14 — "a property for a decision already fully pinned from above"         |
| `property-testing/property-file-purity`          | property files stay pure                        | **keep**    | 07 (pure files) + 01 CONST-P1                                                      |
| `property-testing/require-effect-fastcheck`      | `fast-check` via the Effect integration         | **keep**    | 07 — the family's obligation rule (census OX-OB1)                                  |
| `test-hygiene/no-behaviourless-assertion`        | no assertion that exercises no behaviour        | **keep**    | 07 CONST-T10/T3 — an assertion that notices nothing                                |
| `test-hygiene/no-unrun-effect-test`              | an Effect test is run, not built and discarded  | **keep**    | 07 — law-independent defect                                                        |
| `test-hygiene/damp-test-naming`                  | test names follow the DAMP convention           | **delete**  | ungrounded (a naming convention is prose, not a gate — 08 "Prose is not a gate")   |
| `test-hygiene/pbt-naming`                        | property-test names follow the PBT convention   | **delete**  | ungrounded (same)                                                                  |
| `test-placement/tests-import-public-api`         | a test imports the published surface            | **keep**    | 07 CONST-T9/CONST-T8 — tests call published names or pure decisions                |
| `test-placement/behaviour-exercises-use-case`    | a behaviour spec exercises a use case           | **keep**    | 07 CONST-T8 — never a private forwarding helper                                    |
| `test-placement/behaviour-test-requires-gherkin` | a behaviour test is written in Gherkin          | **keep**    | 07 composition family — law-independent defect (the repo's composition vocabulary) |
| `test-placement/in-source-test-prop-only`        | an in-source block holds property tests only    | **keep**    | 07 CONST-T14 — properties on the pure core                                         |
| `test-placement/in-source-test-targets-private`  | in-source tests target private code             | **keep**    | 07 CONST-T8 — pure-logic properties, not forwarding helpers                        |
| `test-placement/no-io-module-in-source-test`     | no I/O module inside an in-source test          | **keep**    | 01 CONST-P1 — test purity                                                          |
| `test-placement/behaviour-one-feature-per-file`  | one Gherkin feature per file                    | **delete**  | ungrounded (file organization; 04 CONST-N3 is review, not a rule)                  |
| `test-placement/no-test-file-in-src`             | no `*.test.ts` under `src/`                     | **delete**  | 07 CONST-T12 — filename/suffix-keyed classification is forbidden                   |
| `test-placement/src-property-test-cell`          | a `src/` property test occupies an allowed cell | **delete**  | 07 CONST-T12 + 04 Drifted Key — directory-shape rule                               |
| `test-placement/test-file-outside-tests-dir`     | test files outside `tests/` follow placement    | **delete**  | 07 CONST-T12 + 04 Drifted Key — directory-shape rule                               |
| `test-placement/test-suffix-outside-src`         | a `*.test.ts` outside `src/` follows placement  | **delete**  | 07 CONST-T12 — suffix-keyed classification                                         |
| `test-placement/tests-dir-helpers-in-fixtures`   | helpers under `tests/` live in fixtures         | **delete**  | 07 CONST-T12 + 04 Drifted Key — directory-shape rule                               |

### Article 08 — Enforcement and the root's own configuration

The root's stock configuration is part of the reachable rule set (census §6).

| Rule / config (owner)                                         | Enforces                                                                                                                                                                                           | Disposition | Endgame grounding                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `complexity` — canonical root config, path-scoped             | complexity ceilings on `**/src/**`, `*.workflow.ts`                                                                                                                                                | **keep**    | 01 UNIT-P2 — "oxlint cyclomatic-complexity gate…on decision files"; 04 `.workflow.ts` gate                                          |
| `no-restricted-imports` — canonical root config               | bans `node:*`, bare builtins, `@std/*`                                                                                                                                                             | **keep**    | F2 binds it at `error`; 04 PROD-PKG1's boundary audit is the endgame's stronger mechanism, recorded not enacted                     |
| `categories: { correctness: 'error' }` — canonical root       | the stock correctness tier                                                                                                                                                                         | **keep**    | 07 static family + 08 ENFORCE-L5 (clean-tree error enrollment)                                                                      |
| stock tier — `oxlint-plugin-recommended`, 25 ids / 8 families | assertion/cast, unsafe-flow, promise, control-flow (incl. `no-ternary`, `switch-exhaustiveness-check`), value, module (`import/no-cycle`), suppression (`unicorn/no-abusive-eslint-disable`), test | **keep**    | 07 static family; 09 prohibited-artifacts (suppressions, `warn`, unchecked casts); 01 UNIT-P2 (`?:` banned); 02 exhaustive dispatch |

### Endgame laws with no current rule

The endgame's named laws whose `check:` names a mechanism with no implementation in the census. These are the rule set's gaps — not census rows — and their dispositions say where each closes.

| Endgame law                                                 | `check:` names                                                              | Disposition                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| 01 UNIT-P1 — no platform/I/O imports in core decision files | import-graph lint                                                           | **demote-to-import-graph** |
| 01 UNIT-B6 — type-carried phase ordering                    | tsc rejects out-of-order phase composition                                  | **promote-to-tsc**         |
| 01 UNIT-M1 — marker nominality / no spread-override         | oxlint bans spread-override on branded markers                              | **new-rule**               |
| 02 CELL-L2 — pipeline composability (no sequential runs)    | oxlint bans sequential `Cell.run` in generator blocks                       | **new-rule**               |
| 02 CELL-L4 — one binding site per process                   | oxlint bans `Effect.provide` inside domain/engine functions                 | **new-rule**               |
| 02 CELL-L6 — run only when R is never                       | tsc rejects `Cell.run` with inhabited R                                     | **promote-to-tsc**         |
| 02 CELL-L8 — discrete decisions on channel A                | tsc rejects `Stream` in cell output type A                                  | **promote-to-tsc**         |
| 02 CELL-L10 — cross-cell lifetimes close at the edge        | oxlint bans `Effect.scoped`/`acquireRelease` outside the composition root   | **new-rule**               |
| 03 CORE-D3 — domain branding                                | oxlint `schema-bare-primitive-field`                                        | **new-rule**               |
| 03 CORE-D4 — tagged unions over optional state fields       | oxlint flags an optional correlating with the discriminant                  | **new-rule**               |
| 03 CORE-BND1 — nominal brand integrity                      | oxlint `schema-brand-requires-decode`                                       | **new-rule**               |
| 04 PROD-PKG1 — host platform is an adapter (manifests)      | boundary audit bans platform imports in Language/Engine manifests           | **demote-to-import-graph** |
| 04 PROD-ENG1 — engine-to-engine decoupling                  | import-graph lint bans sibling-engine import edges                          | **demote-to-import-graph** |
| 04 PROD-CFG1 — configuration as context tags                | oxlint bans `process.env`/`Effect.config` in language/engine packages       | **new-rule**               |
| 05 SURF-INT1 — import-time inertness                        | oxlint bans top-level side-effect calls                                     | **new-rule**               |
| 05 SURF-SHP1 — shape closure (no homeless exports)          | oxlint export-shape lint; api-extractor rollup                              | **new-rule**               |
| 05 SURF-AFF1 — affordance closure                           | oxlint bans class methods returning `Effect`/`Promise`                      | **new-rule**               |
| 06 STORE-TX1 — store transaction monopoly                   | import-graph lint bans direct driver imports in cell/workflow bodies        | **demote-to-import-graph** |
| 06 STORE-CAP1 — capability authority binding                | oxlint bans `tenantId` arguments in store ports                             | **new-rule**               |
| 06 STORE-ENC1 — handle encapsulation                        | oxlint bans raw `SqlClient`/Knex/Drizzle/Prisma types in Service interfaces | **new-rule**               |
| 08 ENFORCE-L5 — clean-tree error enforcement                | CI `--deny-warnings` fails on any warning                                   | **demote-to-import-graph** |

### Laws carried by no oxlint rule

Named so the consolidation plan does not hunt for a rule to keep: `01 UNIT-B1` (boundary handlers hold no decisions — review), `02 CELL-ALG1` (dual combinators — review), `03 CORE-REF1` (refusal partition audit — review), `06 STORE-TOC1` (guard predicates — review), `07 VERIF-ORC1`/`VERIF-NOU1`/`VERIF-PIN1` (sabotage / review), `08 ENFORCE-E8` (git hook), `08 ENFORCE-E5` (CI recomputation).

### Counts

| Basis                                                               | keep | rescope | delete | demote-to-import-graph | promote-to-tsc | new-rule |
| ------------------------------------------------------------------- | ---- | ------- | ------ | ---------------------- | -------------- | -------- |
| Census custom rules (65 distinct, derived from the per-leaf tables) | 36   | 7       | 18     | 4                      | 0              | —        |
| Root stock config entries (3)                                       | 3    | 0       | 0      | 0                      | 0              | —        |
| Stock tier (`oxlint-plugin-recommended`, 8 families / 25 ids)       | 8    | 0       | 0      | 0                      | 0              | —        |
| Endgame laws with no current rule (21)                              | —    | —       | —      | 5                      | 3              | 13       |

**No existing census rule is displaced by the type-checker.** The three tsc-carried laws (UNIT-B6, CELL-L6, CELL-L8) are all new laws; the census's `promote-to-tsc` column is therefore empty and the endgame-laws table carries all three.

### Rules not groundable in an endgame doc

Twelve existing rules enforce no endgame law, and all twelve are dispositioned **delete** above; each is named here so the consolidation plan re-examines it rather than inheriting it silently: `effect-native/no-logging-in-catch`, `effect-native/no-native-map-in-effect`, `effect-native/no-native-set-in-effect`, `effect-native/no-new-worker-with-wasm-import`, `tag-discipline/no-bodyless-status-assertion`, `structure/ban-classes`, `structure/no-inline-destructured-type`, `effect-schema/schema-checked-element-named`, `effect-workflow/damp-workflow-stem`, `test-hygiene/damp-test-naming`, `test-hygiene/pbt-naming`, `test-placement/behaviour-one-feature-per-file`.

Two **kept** rules rest on a weak grounding and are flagged for re-examination: `test-placement/behaviour-test-requires-gherkin` (kept on the composition family's vocabulary) and the three `test-placement/in-source-test-*` rules (kept on CONST-T14/CONST-T4; their in-source selection is content-keyed and therefore CONST-T12-safe, but the endgame does not itself name in-source blocks).

---

## Implementation Units

Order is fixed: evidence before fixes, fixes before flips, flips before deletion.

**U0 — Evidence: the strict red-set dry run (own commit; no product code).**

- **Files:** the dry-run record (`docs/census/oxlint/strict-red-set.md`) and a throwaway probe config. No consumer source and no preset source.
- **Approach:** for each of the 19 ex-base consumers, run oxlint against that consumer with a probe config that `extends` its **classified** root (U0b's classification; `all` for product, `instrument` for evaluator surface) plus the consumer's own `defaultIgnores`, and record findings as counts keyed by rule id (`oxlint --format json`). Produce the per-consumer red set, the per-rule totals, and the consumer order (largest red first — F1). The probe is throwaway: never committed as a consumer config, and the run edits nothing (CONST-E9).
- **Verification:** the record names, per consumer, the red count and the rule ids carrying it; the largest-red-first order is derivable from it.

**U0b — Classify the flip targets and disposition the red set (own commit; review record).**

- **Approach:** two rulings, both recorded before the first flip. (1) **Flip-target classification:** each of the 19 consumers is product (`→ all`) or evaluator surface (`→ instrument`); the classification is evidenced — the preset package's own config (`packages/oxlint-plugin/all/oxlint.config.ts`, currently `extends: [base]`) is evaluator surface and takes `instrument`, matching the parent's R7 subtree target. (2) **Population disposition:** apply F3's ladder at the population level — which reds are fixable by extraction/`@effect/platform`/type hygiene, which are dead code (delete), which mark code that should move to the instrument root (reclassify). Individual `declare` statements stay per-PR (F3).
- **Verification:** every consumer has a classified root and every red-set rule id has a population disposition before U1 starts.

**U1…Un — Fix-then-flip, one unit per ex-base consumer (largest red first).**

- **Files:** the consumer's `oxlint.config.ts` (the flip) and its `src/**`/`tests/**` (the fixes).
- **Approach:** drive the measured red set to zero by code fixes in their own commits (F3 fix; `node:*` → `@effect/platform`; complexity/no-ternary extraction toward small pure functions; the strict trio is type hygiene), then flip `extends: [base]` → `extends: [<classified root>]` + `defaultIgnores` as the unit's final commit (KD4). A red that will not fix takes exactly one of F3's other exits; `declare` is a CONST-W3 statement in that PR, never a config edit.
- **Verification (F1's gate):** the consumer's lint is green **before** the flip at today's strength and green **after** at strict strength, both recorded; `pnpm check:local` green after the unit; no `': 'warn'` entered anywhere.

**Uz — Delete `@systemfsoftware/oxlint-config` and audit for hatches (F4; own PR).**

- **Files:** `packages/oxlint-plugin/oxlint-config/**` (deleted), every manifest resolving it, the deletion changeset.
- **Approach:** after the last flip, delete the package and every manifest edge to it — re-derive nothing, the transitional preset dies whole. Then run the repo-wide hatch audit: no `warn` literal, no allowlist, no baseline, no consumer config re-declaring a plugin set or rule list the canonical root owns; every surviving exception is a CONST-W3 declaration named in its own PR.
- **Verification (F4's gate):** no manifest resolves `@systemfsoftware/oxlint-config`; the tree builds and lints with the package absent; the zero-`warn` grep returns 0; `pnpm check:local` green.

---

## Testing

**Admission gate first (`choose-test-layer` step 0).** Every test this plan proposes or implies passes the gate before it is written: in-process through a published programmatic surface, importing nothing else, asserting only externally observable outcomes, zero test-born exports, no spawned process. The gate's verdict overrides this plan. **Outcome here: no test is proposed and none is admitted.** The plan's subjects are a config `extends` line, code fixes, and a package deletion; the observer of all three is the lint gate and the workspace build, not an authored test. The registration and host-semantics tests the preset needs belong to the parent plan (R1/R6) and are not re-authored here; a test asserting "the config extends X" would assert the diff, which the diff already shows. A refused test that already exists is deleted in the same change — none is in scope.

**The plan's proof is the gates it turns green and the audits it runs.**

- **F1's per-consumer gate (primary proof):** `pnpm --filter <pkg> lint` green **before** the flip at `base` strength and green **after** at strict strength. Both runs recorded in the consumer's PR. A flip whose after-run is red is not a flip. The repo-wide chain is an addition, not a substitute — a filtered per-consumer run is what proves that consumer ran.
- **F2's zero-`warn` gate:** `grep "': 'warn'"` over `packages/**/oxlint.config.ts` and the preset sources returns 0.
- **F4's no-hatch audit:** repo-wide search for `oxlint-config`, for a re-declared plugin set, and for a rule-list literal outside the preset package; each surviving exception cites a CONST-W3 declaration.
- **Repo chain:** `pnpm check:local` after each flip and again after Uz; `gh pr checks --watch --fail-fast` per PR (REPO-D1).

---

## Risks and Destructive Review Record

## Protected Invariants

1. Parent F1–F4 ship verbatim, gates included; this plan quotes them and does not re-word them.
2. The artifact contract is `ce-unified-plan/v1`, readiness `requirements-only`, execution `code`; the disposition table covers every rule id the census registers, each with exactly one disposition and a grounding citation.
3. The plan is authoring-only: it modifies no file outside `docs/plans/2026-09-12-strict-enrollment.md` and executes no unit.

These are excluded from the assumptions below; all three appear in the Delta's **Kept**.

### Phase 1 — Assumptions surfaced (exactly three)

1. **The red set is bounded and mechanical** — that every red is fixable by extraction, an `@effect/platform` swap, or the strict trio's type hygiene, rather than by a structural rebuild.
2. **The flip target is a constant** — that all 19 ex-base consumers enroll on the product root.
3. **A per-consumer before/after lint pair is sufficient evidence** — that no separate measurement is needed beyond the dry run and the gate.

### Phase 2 — Mutation lens

**Selected:** Substitution (rotated from — none; this is cycle 1, so any lens is permitted). **Rationale:** the artifact's symptom is competing structural patterns: a per-consumer flip versus a repo-wide flip, and a `base` preset versus an `instrument` root standing in for it. Substitution names exactly that.

### Phase 3 — Divergence

**3 failures under Substitution:**

1. **The flip target is substituted for a constant.** The plan's Goal Capsule and U1…Un write `extends: [all]` for every ex-base consumer. But `packages/oxlint-plugin/all/oxlint.config.ts` — the preset package itself — extends `base` today (measured), and the parent built the instrument root for its subtree (`packages/oxlint-plugin/oxlint.config.ts`; parent R7/KD4). Exact location: Goal Capsule acceptance ("every ex-base package flipped") and U1…Un ("`extends: [all]`"). Under Substitution this is a real defect: the preset's own source would be linted by the strict product root.
2. **Numbers substituted for measurement.** The Counts table states "65 custom rules", "36 keep", "7 rescope", "18 delete", "4 demote" with no re-runnable derivation; the census headline says 150 registered ids and enumerates a different set. Exact location: "### Counts". A reader cannot reproduce the arithmetic, so the table's totals are a claim wearing an inventory's clothes (`agent-docs` ADOC-A4).
3. **A record substituted for an authorization.** The disposition table's `await promote-to-tsc`, `demote-to-import-graph`, `new-rule` and `delete` rows describe the target rule set, while the plan's Scope already defers them. Exact location: the Rule Disposition Table preamble. Read without the KD6 preamble the table authorizes a rule change — an evaluator edit this plan must not make (CONST-E9).

**Diverged draft:** flip the **preset** instead of the consumers. Make the canonical root the only enrollment target, let `base` become a thin alias forwarding to it, land the consumers on the alias in one pass, then delete the alias once the tree is green. Or equivalently: keep one root and re-point everything at once.

### Phase 4 — Convergence

## Delta Report

- **Lens applied:** Substitution.
- **Kept:** Protected invariants 1–3 (F1–F4 verbatim; the artifact contract; authoring-only scope); the disposition table's rows and method; KD1–KD6.
- **Replaced:** "every ex-base package flips to `all`" → "each consumer flips to its classified root" (`all` for product, `instrument` for evaluator surface) (reason: failure 1 — the preset package is evaluator surface).
- **Added:** U0b's flip-target classification (reason: failure 1); the counts' derivation basis (reason: failure 2); KD6 and the table preamble "record, not authorization" (reason: failure 3); the wiki/`warn-never-rests` grounding and the DFER counter-doctrine in KD2 (reason: the universal warn ban's premise was unstated in the prior draft).
- **Removed:** nothing structural — the prior draft's Risks prose was replaced by this review's three-assumption form (reason: exactly three testable assumptions, per the protocol).

**Why the diverged draft was rejected:** the alias is a baseline under a different name (KD2/ENFORCE-L5 forbids it), and a single-pass flip destroys F1's per-consumer before/after pair. Its useful residue is kept: the flip-target classification (failure 1's fix).

## Remediation Report

| # | Failure                                                                                           | Class                                                             | Resolution                                                                                                                                                                            | Research |
| - | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1 | Preset package (`packages/oxlint-plugin/all`) is evaluator surface yet the plan flips it to `all` | Clear — settled by the artifact (`extends: [base]`) and parent R7 | KD5 + U0b classify each consumer; the preset flips to `instrument`; acceptance re-worded to "classified root"                                                                         | N/A      |
| 2 | Counts table is arithmetic no command re-derives, and conflicts with the census headline          | Clear — the census's per-leaf tables are the source               | Counting basis stated (65 distinct custom = per-leaf tables; 150 = 125 registered incl. 60 re-keys + 25 stock), marked derived, with the census headline named as the measured figure | N/A      |
| 3 | The disposition table reads as authorization to edit the evaluator                                | Clear — parent U0(c)/KD6 already scope it                         | KD6 + preamble state the table is a record for the deferred plan; the only evaluator edits here are `base`'s deletion and each `extends` line                                         | N/A      |

---

## Deferred

- **Article consolidation of the ten leaves into endgame-article packages** (parent KD6). The disposition table's only consumer.
- **The 13 `new-rule` rows** — each needs its own RuleTester suite and red-green proof.
- **The 5 `demote-to-import-graph` and 3 `promote-to-tsc` rows** — each needs the instrument that will carry it (import-graph/boundary audit; `effect-cell-types`/tsc).
- **The 12 ungrounded rules** — re-examine (delete or re-ground) in the consolidation plan.
- **Deprecating the four source-less published names** (`cell-imports`, `cell-taxonomy`, `effect-executor`, `effect-kernel`) — registry actions, not tree work (census, "Registry state").

## Related

- `docs/plans/2026-09-12-0311-refactor-composable-oxlint-presets-plan.md` — the parent; F1–F4 are its binding follow-up contract and U0(c) opens this stub.
- `docs/census/oxlint/CENSUS.md` — the measured inventory every disposition row and count traces to.
- `docs/census/oxlint/external-consumer-audit.md` — parent U0(a)/(b); no externally-identifiable consumer population exists for the broken surfaces.
- `/tmp/endgame/` (2026-09-12, user-authored) — articles 01–10; their `check:` columns ground the disposition table.
- Wiki: `warn-never-rests` (the `error`-or-nothing rule and its falsification condition), `incremental-adoption-topology` (tiers via `extends`, severity `error`).
- Web: Minotto, _Deprecate. Fix. Enforce. Repeat._ (`http://emanueleminotto.github.io/blog/dfer`) — the staged-`warn` + frozen-baseline pole this plan rejects under KD2.
- `CONSTITUTION.md` — CONST-W3, CONST-S4, CONST-E8/CONST-E9.
