---
title: "feat: Lint-gate two-run Cell chaining and platform-service provideService on Cell.run"
date: 2026-09-01
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
related: PR #341
---

## Goal Capsule

- **Objective:** An author who sequences two sandwiches by feeding one `Cell.run` success into a second `Cell.run`, or who `provideService`s a captured `FileSystem`/`Path` onto a `Cell.run`, gets an error diagnostic from the lint gate the monorepo already runs — and the two live sites of that shape are gone.
- **Means:** Two syntax-only error rules in `@systemfsoftware/oxlint-plugin-cell-vocabulary`, registered at `error` in `configs.recommended`, which `@systemfsoftware/all` spreads into the monorepo preset (KTD1, KTD2).
- **Authority:** the acceptance criteria and boundaries in the originating issue; this plan's Requirements; repo constitution where they conflict, in that order.
- **Execution profile:** one branch off `cell-endgame` worktree HEAD (`b10199575d3`), units landed in order U1→U6.
- **Stop conditions:** `Cell.run` deletion or a type-encoding change proposed as the fix (issue boundary forbids both); any acceptance criterion unprovable — return incomplete naming it.
- **Tail ownership:** pipeline ships PR and watches CI; residuals recorded in the PR body.

---

## Product Contract

### Summary

PR #341 made the Cell end-game advisory: `tsc` accepts two-run chaining and platform-service `provideService` on a run, and `@systemfsoftware/oxlint-plugin-cell-vocabulary`'s recommended config contains only `no-io-in-phase-bodies` (verified at `b10199575d3`: `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/index.ts` lines 7–9). The engine composition test pins the two-run shape as the passing case and the html-reporter launders captured `FileSystem`/`Path` instances onto each event's run. Both are silent today. This change adds the two missing error rules and migrates the two sites.

### Problem Frame

`Cell.run` is a dual `(self, input) => Effect<A, E, R>` (`packages/core/effect/cell/types/src/Cell.ts` lines 147–153). Two well-typed calls are a well-typed program: the checker knows shape, not sense, and sequencing meaning is not carried by a `.d.ts`. Missing root provide when `R` is inhabited is already a compile error; the unguarded residue is purely syntactic, and the binding rung after the compiler is the lint gate. The existing plugin already reads its facts off `Cell.vocabulary` at load (`no-io-in-phase-bodies.config.ts`), so the new rules' Cell-surface names ride the same channel instead of being restated as literals (plugin AGENTS.md CELL-V1).

### Requirements

**Rule A — two-run chain**

- R1. A rule `no-two-run-chain` reports an `error` diagnostic on the second `Cell.run` of a two-run chain: inside one function body (arrow, function expression, function declaration, or the `function*` passed to `Effect.gen`), the later `Cell.run`'s input argument is an identifier — or a member expression rooted at one — whose binding in that same body is the success of an earlier `Cell.run`. Recognised binding forms: `const x = yield* Cell.run(...)`; `const x = Cell.run(...)`; destructured patterns whose init is a run success — `const { a } = yield* Cell.run(...)` and `const [a] = yield* Cell.run(...)` taint every identifier the pattern binds; and a `flatMap`/`Effect.andThen`/`Effect.map` callback parameter whose receiver is a `Cell.run` call. Both dual forms are recognised: data-first `Cell.run(self, input)` and data-last `pipe(self, Cell.run(input))` (an effect-`pipe` call whose arguments include a one-argument `Cell.run(input)` curried call), including `.pipe(...)` member chains whose steps contain the same curried form.
- R2. Rule A's invalid fixtures are byte-faithful copies of the evidenced shape in `packages/testing/mutation/stryker-js/engine/tests/cell-layer-composition.integration.test.ts` lines 55–60, plus the pipe/`flatMap` form, an empty-`R` two-run, an import-below-call line-order variant, a member-rooted input (`Cell.run(second, firstResponse.id)`), an object-destructured success (`const { id } = yield* Cell.run(...)` fed onward), and a data-last two-run (`pipe`-curried `Cell.run(input)` fed a prior success). Fixture source spells `Cell.run` literally — fixtures mirror consumer source text; the rule's recognition alone reads `Cell.vocabulary.shell`, so a severed or wrong vocabulary literal turns every invalid fixture green-unreported and the suite red. The suite is the invariant gate for the shell table.
- R3. Rule A stays silent on, and carries valid fixtures for: the `mutationRun` `andThen` chain (`packages/testing/mutation/stryker-js/engine/src/Run.ts` lines 1125–1130); a single `Cell.run`; two `Cell.run` calls with independently sourced inputs (`new OrderRequest(...)` both times), including a data-last `pipe` pair and a destructured-but-independently-sourced pair; `Cell.zip`; and `andThen` of Cells whose `A`/`I` do not unify (already a type error; the lint rule must not also fire). Every documented non-reach shape is also a pinned valid fixture: closure-captured binding, imported helper, reassignment (`let r; r = yield* Cell.run(...)` then re-assigned before the second run), packed-object indirection (`{ r: firstResponse }` then `Cell.run(c, packed.r)`), and the `self.run` method form.

**Rule B — platform-service provideService on a run**

- R4. A rule `no-platform-provide-service-on-run` reports one `error` diagnostic per banned `provideService` call applied to the Effect returned by `Cell.run`. Banned tag argument: a member expression `X.FileSystem` / `X.Path` whose object is a binding imported from `effect/FileSystem` / `effect/Path`, or a bare identifier bound by a named import of `FileSystem` / `Path` from those same sources. `provideService` is recognised as a member on an `effect/Effect` import binding or as a named import from `effect/Effect`. Applied-to-a-run shapes: the data-first first argument (`Effect.provideService(Cell.run(c, i), tag, impl)`); a `.pipe(...)` chain whose leftmost receiver is a `Cell.run` call, where any pipe step is a two-argument `provideService(tag, impl)` curried call — the evidenced reporter shape; and a one-argument data-last step. The invalid fixture is the evidenced `packages/testing/mutation/stryker-js/html-reporter/src/Reporter.ts` lines 68–70 and yields exactly two diagnostics.
- R5. Rule B stays silent on, and carries valid fixtures for: `Cell.provide(layer)` / `Effect.provide(layer)` after one `Cell.run` (composition-root Layer provide); `Effect.provideService(VitestHarness, …)` / `TypeScriptCompiler` (adapter tags); `Layer.succeed(FileSystem.FileSystem, fs)` at a root (not piped off a run); `yield* FileSystem.FileSystem` inside a Cell phase; a `Cell.run`-rooted pipe whose `provideService` step carries a non-banned tag; and the documented non-reach shapes — a `provideService` whose receiver is an identifier returned by a helper (the `Cell.run` hidden behind the helper boundary), and the `cell.run(input)` method form. Note the boundary precisely: a module-level helper whose own body contains the full `Cell.run(...).pipe(Effect.provideService(FileSystem.FileSystem, …))` chain DOES fire — the banned call's receiver syntax sits inside the helper, and rules report on the call wherever it is written.

**Delivery and gate**

- R6. Both rules are registered at `error` in `configs.recommended` in `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/index.ts`, reaching consumers through the existing `...cellVocabulary.configs.recommended.rules` spread in `packages/lint/oxlint/all/src/mod.ts` (line 60) — every added oxlint rule lands in the `all` preset, at `error`, with no `warn` and no dated baseline.
- R7. Pasting an invalid fixture into a package that extends `@systemfsoftware/all` makes that package's lint exit non-zero; replacing it with the matching valid fixture exits 0.
- R8. Inverting the two-run/`andThen` valid/invalid fixture pair makes `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test` exit non-zero; a comment on the pair records this so the fixtures are not "simplified".
- R9. The two live sites are migrated — the integration test pins the `andThen` shape, the reporter drops both `provideService` calls — with no rule disabled in any consumer config and no baseline hiding the evidenced files.

**Boundaries (hard)**

- R10. `Cell.run`, `Cell.layer`, `Cell.andThen`, `Cell.zip`, and `Cell.provide` are not deleted or narrowed; no type-level encoding changes Cell variance or the `Run` alias.
- R11. No phase names or Cell-surface names (`run`, `andThen`, `zip`, `provide`) are restated as string literals in the plugin's `src/` where `Cell.vocabulary` can supply them; `Effect.provideService`, `FileSystem`, and `Path` are not Cell surface and live in a plugin-side config table with the load-time empty-set throw copied from `no-io-in-phase-bodies.config.ts`.

### Key Decisions

- **Two syntax-only rules, never a type encoding** (session-settled: user-directed — chosen over a type-level encoding or a tsgolint channel: the checker knows shape not sense, and oxlint JS plugins receive only a serialized AST with no type channel, so the residue is AST predicates with honestly named reach). Governs R1, R4, R10.
- **Error in the plugin's recommended config, delivered through the `all` spread** (session-settled: user-directed — chosen over `warn` severity or a test-only registration: a rule the preset does not load never fires on a consumer, and warn is dominated by error). Governs R6.
- **Predicates stop at the first indirection they do not follow** (session-settled: user-approved — chosen over a heroic alias analysis: governing cost is false positives against independently sourced runs and adapter-tag provideService, so non-reach is documented in the message and pinned with valid fixtures). Governs R1, R3, R4, R5.

### Scope Boundaries

- Not a tsgolint / `@effect/tsgo` fork; not deleting `Cell.run`; not a doctrine paragraph that says "use `andThen`" with `check: review`; not walking `andThen`/`zip` chains for other properties; not reporting `Layer.succeed` / `Layer.mergeAll` at a composition root.
- The `self.run(input)` method form is out of predicate reach for both rules (declared in the messages, pinned by valid fixtures) — distinguishing a Cell instance's `.run` from any `.run` is impossible without types, and both evidenced sites use the `Cell.run` namespace form.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Syntax-only predicates over import bindings.** Rules classify imports in a `Program` listener (never `ImportDeclaration` — the line-order trap is documented in `no-io-in-phase-bodies.ts` lines 115–122) and key every decision on the import binding plus `source.value`, never on identifier text. Mirrors the existing rule's `classifyImport`. Implements the settled "two syntax-only rules" decision.
- KTD2. **Delivery is registration, not config edits.** Both rules enter `configs.recommended` at `error` in the plugin's `src/index.ts`; `all/src/mod.ts` already spreads that map, so consumers go red with no edit to `all` and no consumer config change. Implements the settled "all preset at error" decision.
- KTD3. **`Cell.vocabulary` gains a `shell` table; Effect/FileSystem/Path stay plugin-side.** `Vocabulary` and `vocabulary` in `packages/core/effect/cell/types/src/Cell.ts` (lines 266–278) gain `shell: { run: 'run', andThen: 'andThen', zip: 'zip', provide: 'provide' }`, bound at plugin load the way `COMPOSER_NAME` is bound. This is additive — no variance or `Run` alias change. Rejected alternative: a plugin-local constant module carrying the four names — it keeps the published surface untouched but restates Cell surface as literals in the plugin's `src/`, which CELL-V1 forbids, and it silently forks if the surface ever renames. Wrong-literal protection is double-gated without a dedicated test: the literal-typed fields make `run: 'runx'` a type error, and U2/U3's invalid fixtures spell `Cell.run` literally while the rule reads the name off the vocabulary, so a severed literal fails the plugin suite (R2). The platform-service tags and `provideService` are not Cell facts: rule B's config module owns them, with the load-time empty-set throw pattern copied from `no-io-in-phase-bodies.config.ts` lines 42–56.
- KTD4. **Rule A reach.** Same function body; binding forms enumerated in R1 (including destructured patterns — an `ObjectPattern`/`ArrayPattern` declarator whose init is a run success taints every identifier it binds; that is the AST's literal shape, not alias analysis). An input argument counts when it is the bound identifier or a member expression rooted at it (`firstResponse.id` fires; `{ r: firstResponse }` packed into an object does not — the object's init is an `ObjectExpression`, not a run). Data-last recognition: a `Cell.run(input)` curried call appearing as an argument of an effect-`pipe` call or as a step in a `.pipe(...)` member chain is the same run with its input at argument position 0. Renamed imports work by construction: import classification stores `specifier.local.name`, so `import { Cell as C }` binds `C`; the literal `Cell.run` in message text names the recognised surface, not a text match. Out of reach, declared in the message and fixture-pinned (R3): bindings from an enclosing closure, imported helpers, reassignment, the `self.run` method form. The destructive review's inversion lens added one recognition beyond the issue text: the pipe/`flatMap` form is the gen case without `yield*` and is in scope as an invalid fixture.
- KTD5. **Rule B reach.** Tag argument banned per R4 — member expression on an `effect/FileSystem` / `effect/Path` binding, or bare identifier from a named import of those sources (closes the `import { FileSystem }` bypass; in-repo style is namespace imports across all 32 sites, verified at `b10199575d3`, and zero `@effect/platform/FileSystem|Path` specifiers exist — the set is census-derived, and `no-platform-provide-service-on-run.config.ts` is the single owning file if the census ever changes). `provideService` recognised as a member on an `effect/Effect` import binding or as a named import from `effect/Effect`. "Applied to a run" is syntax on the same expression: the data-first first argument, or a `.pipe(...)` chain whose leftmost receiver is a `Cell.run` call with any step a curried `provideService(tag, impl)` — the evidenced reporter shape. A helper whose own body contains the full chain still fires (R5); only a `provideService` applied to an identifier a helper returned is documented non-reach.
- KTD6. **Migration is the last unit, not the first.** The rules, registration, and the consumer red/green proof land before the two live sites are touched, so a revert of the migration is red under the gate those packages already run (issue return condition).

### Assumptions

Destructive review (inversion lens, first cycle) surfaced exactly three; all three survived with warrants named:

1. **Identifier-flow predicates cover the evidenced sites without false-positive breach.** Warrant: both live sites are the plain binding shapes R1/R4 enumerate (verified by reading them at `b10199575d3`); legal look-alikes (independently sourced runs, `VitestHarness`/`TypeScriptCompiler` provideService at `vitest-runner/src/Runner.ts` lines 887–897 and `typescript-checker/src/Checker.ts` lines 226–228) differ syntactically at the exact point the predicates test. Under the inversion lens an obligation rule ("sequencing must go through `andThen`") fails: it fires on every file that never builds a Cell, which plugin AGENTS.md CELL-V4 already recorded as the deleted-obligation failure mode.
2. **`shell` on `Cell.vocabulary` is the right home for `run`/`andThen`/`zip`/`provide`.** Warrant: CELL-V1 forbids restating Cell surface as literals in plugin `src/`; the names are Cell facts the published surface can carry; the extension is additive and the plugin is the vocabulary's only known consumer (verified: `lsp references`-equivalent grep finds vocabulary consumed only in `no-io-in-phase-bodies.config.ts` and its test).
3. **Registration in `configs.recommended` reaches every consumer that matters.** Warrant: `all/src/mod.ts` line 60 spreads the map and `engine/oxlint.config.ts` extends `all` (verified at HEAD); the user directive makes `all`-preset membership mandatory and the spread satisfies it without transcribing rule names (transcription drifts; the mod.ts comment at lines 48–56 records that measurement).

### Sequencing

U1 → (U2, U3 independent) → U4 → U5 → U6. U5 must be last among code changes so the gate is live before the sites are migrated.

---

## Implementation Units

### U1. Extend `Cell.vocabulary` with the shell table

- **Goal:** The published vocabulary carries `run`, `andThen`, `zip`, `provide` so the plugin binds them at load.
- **Requirements:** R11 (KTD3)
- **Files:** `packages/core/effect/cell/types/src/Cell.ts`
- **Approach:** Add `readonly shell: { readonly run: 'run'; readonly andThen: 'andThen'; readonly zip: 'zip'; readonly provide: 'provide' }` to `Vocabulary` and the matching value to `vocabulary`. Literal-typed fields, mirroring `composer: 'layer'`. Run the vocabulary's reference surface (plugin config + test) to confirm no consumer constructs the interface. Regenerate the api-extractor report (`api:update`) since `Vocabulary` is on the published surface — `api:check` otherwise fails.
- **Patterns to follow:** `composer: 'layer'` in the same interface.
- **Test scenarios:** `Test expectation: none — additive const table; the gate pair is typecheck plus the plugin suite's fixture pinning (R2, KTD3).` Typecheck `effect-cell-types`; the plugin's CELL-V1 grep (`grep -nE "'(read|decode|decide|encode|write|pure|impure|store|adapter)'" src/` in the plugin) still returns nothing but `DESCRIPTION_NAMESPACE`.
- **Verification:** `pnpm --filter @systemfsoftware/effect-cell-types typecheck` and `api:check` exit 0; existing plugin tests still green (the plugin ignores the new field until U2/U3).

### U2. Rule A — `no-two-run-chain`

- **Goal:** Every two-run chain in the evidenced shapes reports `error` on the second `Cell.run`.
- **Requirements:** R1, R2, R3 (KTD1, KTD4)
- **Dependencies:** U1
- **Files:**
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/cell.ts` (shared `isCellMemberCall` helper lives here when both rules peel the same member expression — both units name this file so the helper has its two consumers, never one)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/no-two-run-chain.config.ts` (new)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/no-two-run-chain.ts` (new)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/__tests__/no-two-run-chain.test.ts` (new)
- **Approach:**
  1. Config module binds `RUN_NAME` / `ANDTHEN_NAME` etc. from `Cell.vocabulary.shell`, `MODULE_SOURCE` from `Cell.vocabulary.module`, and throws at load on an empty shell table (copy the guard pattern from `no-io-in-phase-bodies.config.ts`).
  2. Rule classifies description-namespace imports in `Program` (copy the scan; listeners fire in document order and judge against empty sets otherwise).
  3. Per function body (including the `function*` argument of `Effect.gen`), collect run-success bindings per R1, then report any later `Cell.run` whose input argument is one of those identifiers or rooted at one.
  4. Message follows the `{{name}} is forbidden. Expected: … Actual: … Fix: …` template; Expected/Actual name the exact reach (same function body, identifier flow from a prior `Cell.run` binding); Fix: `compose the Cells with Cell.andThen (or Cell.zip) and Cell.run once`.
- **Patterns to follow:** `no-io-in-phase-bodies.ts` `classifyImport`/`Program` scan; `no-io-in-phase-bodies.config.ts` guard and message constants; the RuleTester suite shape in `no-io-in-phase-bodies.test.ts` (axis values interpolated from `Cell.vocabulary` at runtime, last-entry fixtures).
- **Test scenarios:**
  - Invalid per R2: byte-faithful `runBoth` gen body from the integration test; pipe/`flatMap` two-run; empty-`R` two-run; import-below-call variant; member-rooted input (`Cell.run(second, firstResponse.id)`); object-destructured success fed onward; data-last `pipe`-curried two-run fed a prior success.
  - Valid per R3: `mutationRun` `andThen` chain; single `Cell.run`; two independently sourced runs (`new OrderRequest(...)` both times), one pair data-last and one pair destructured; `Cell.zip`; and every documented non-reach shape — closure-captured binding, imported helper, reassignment, packed-object indirection, `self.run` method form.
  - The valid `andThen` fixture passes when the two-run invalid fixture is deleted — the rule is not one big always-fail.
  - Inversion comment on the two-run/`andThen` pair per R8.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test` exits 0 with the new suite included.

### U3. Rule B — `no-platform-provide-service-on-run`

- **Goal:** `provideService` of `FileSystem`/`Path` tags onto a `Cell.run` reports one `error` per call.
- **Requirements:** R4, R5 (KTD1, KTD5)
- **Dependencies:** U1
- **Files:**
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/cell.ts` (shared `isCellMemberCall` helper lives here when both rules peel the same member expression — both units name this file so the helper has its two consumers, never one)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/no-platform-provide-service-on-run.config.ts` (new)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/no-platform-provide-service-on-run.ts` (new)
  - `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/rules/__tests__/no-platform-provide-service-on-run.test.ts` (new)
- **Approach:**
  1. Plugin-side config table owns the banned tag map (`effect/FileSystem` → `FileSystem`, `effect/Path` → `Path`) and the `provideService` name; empty-map load throw per the same guard pattern.
  2. `Program` scan classifies the binding families per KTD5: Cell namespace (from `Cell.vocabulary.module`), tag bindings (namespace and named imports from the banned map), and the `Effect` namespace or named `provideService` import (from `effect/Effect`).
  3. On each `provideService` call (member or named-import form), test the tag argument against the banned bindings and the receiver/first argument for a `Cell.run` root per KTD5's same-expression rule; report once per qualifying call — the two-call reporter fixture yields two diagnostics.
  4. Fix text: `provide FileSystem and Path once as a Layer at the process composition root; do not provideService them onto Cell.run`.
- **Patterns to follow:** as U2.
- **Test scenarios:**
  - Invalid per R4: byte-faithful reporter pipe (both tags, two diagnostics); data-first `Effect.provideService(Cell.run(c, i), FileSystem.FileSystem, fs)`; named-import `provideService` form; named-import tag form (`import { FileSystem } from 'effect/FileSystem'` then `provideService(FileSystem, …)` on a run).
  - Valid per R5: `Cell.run(x).pipe(Effect.provide(hostLayer))`; `pipe(cell, Cell.provide(layer), …)` composition-root shape; `Effect.provideService(VitestHarness, h)` on a run; a `Cell.run`-rooted pipe whose `provideService` step carries a non-banned tag; `Layer.succeed(FileSystem.FileSystem, fs)` not piped off a run; `provideService` applied to an identifier a helper returned (documented non-reach); `cell.run(input)` method form (documented non-reach).
- **Verification:** same command as U2.

### U4. Register at error and prove the consumer gate

- **Goal:** Both rules are live in `configs.recommended` at `error`, and a real consumer goes red on a pasted violation and green on the repair.
- **Requirements:** R6, R7, R8
- **Dependencies:** U2, U3
- **Files:** `packages/lint/oxlint/plugins/cells/cell-vocabulary/src/index.ts`; `packages/lint/oxlint/plugins/cells/cell-vocabulary/package.json` (description now covers three rules, not one)
- **Approach:**
  1. Register both rules in the plugin's `rules` map and in `recommendedRules` at `'error'` beside `no-io-in-phase-bodies`. No edit to `all/src/mod.ts` — the spread carries them.
  2. Update the plugin `package.json` description so package metadata does not claim the plugin owns only the phase-purity rule.
  3. Red/green proof targets a consumer that extends `@systemfsoftware/all` and carries NO live violation — engine and html-reporter are disqualified at this point in the sequence because U5 has not migrated them, so their lint is red regardless of the probe and exit 0 is unobservable there. Use a clean consumer (verified at implementation; `@systemfsoftware/stryker-js` language package or `instrumenter` extend `all` per the mod.ts spread) and a new probe file `tests/__lint-probe__/two-run-probe.ts` in that package: paste the invalid fixture, observe the package's lint exit non-zero; replace its contents with the matching valid fixture, observe 0; delete the probe file. Probe file is deleted before U5 starts.
  4. Run the invert check from R8 once (swap the pair, observe suite failure, restore).
- **Patterns to follow:** the existing `rule()` helper and `recommendedRules` map in `index.ts`.
- **Test scenarios:** `Test expectation: none — the consumer proof is a manual gate probe, recorded with command and exit code; the invert check is a deliberate-failure probe, likewise.`
- **Verification:** the clean consumer's lint exits non-zero on the pasted invalid fixture and 0 on the valid one (probe file then deleted); plugin suite exits non-zero under the inverted pair and 0 restored.

### U5. Migrate the two live sites

- **Goal:** The monorepo lint gate is green on the new rules because the evidenced shapes are gone, not because anything is suppressed.
- **Requirements:** R9
- **Dependencies:** U4
- **Files:**
  - `packages/testing/mutation/stryker-js/engine/tests/cell-layer-composition.integration.test.ts`
  - `packages/testing/mutation/stryker-js/html-reporter/src/Reporter.ts`
  - `packages/testing/mutation/stryker-js/html-reporter/src/index.ts` (only if the factory stops needing to yield `FileSystem`/`Path` for params)
- **Approach:**
  1. `runBoth` becomes one composition run once — `pipe(orders.first, Cell.andThen(orders.second))` fed to a single `Cell.run` (both Cells named explicitly; the dual is binary); the scenario still observes that the second sandwich's read raw equals the first's write and the trace order is unchanged.
  2. Reporter: delete both `Effect.provideService` calls from the `Cell.run(...).pipe(...)` chain; the Cell's `R` stays inhabited and flows to whoever runs the reporter effects. `tsc` names every site that must change — the reporter is a library, not a process root, so the Layer provide belongs at the CLI/engine composition root (`cli/src/Cli.ts` line 1109 already provides `hostRunLayer`; `engine/src/Run.ts` lines 343–349 already build the reporter layer under a `FileSystem`/`Path` provide, and `engine/src/Reporter.ts`'s `reportAll` already carries `FileSystem | Path | RunEvents` in its `R`). After the deletion, `params.fs`/`params.path` are dead as `makeHtmlReporter` arguments — remove them and delete the laundering path whole. In `html-reporter/src/index.ts` the `Layer.effect` generator's `yield* FileSystem.FileSystem` / `yield* Path.Path` sites stay only if the layer still requires them; if they exist solely to feed the deleted params, delete those yields too.
  3. Run the reporter's own test suite and the engine integration suite; no baseline, no consumer `off`.
- **Test scenarios:**
  - Integration: the rewritten scenario asserts `secondReadRaw` and `secondWriteRaw` equal the first response, and the four-step trace order is preserved, through `Cell.andThen`.
  - Reporter: existing html-reporter tests pass with the provideService calls deleted (R flowing to the composition root is a type-level guarantee — `tsc` is the gate).
- **Verification:** `pnpm check:local` exits 0 after the last edit; reverting either migration under the new rules makes the owning package's lint exit non-zero (spot-check one revert).

### U6. Changesets

- **Goal:** Consumer-observable changes are declared for release.
- **Requirements:** R6 (release surface)
- **Dependencies:** U5
- **Files:** `.changeset/` (two entries)
- **Approach:** One changeset for `@systemfsoftware/effect-cell-types` (additive `vocabulary.shell`) and one for `@systemfsoftware/oxlint-plugin-cell-vocabulary` (two new error rules in recommended). Bodies are consumer-observable facts only; severity is error, stated once. Use `pnpm change --bump` per repo law (REPO-R2).
- **Test scenarios:** `Test expectation: none — release metadata.`
- **Verification:** changeset-check workflow semantics satisfied (bodies ship verbatim as CHANGELOG entries).

---

## Verification Contract

| Gate                      | Command                                                                                                                                                                                        | Proves                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Plugin tests              | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test`                                                                                                                            | R1–R5 fixtures report/silence as specified; gatekeeper for the whole change |
| Plugin typecheck/lint/api | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary typecheck lint api:check`                                                                                                        | package gates from its AGENTS.md                                            |
| Consumer red/green        | a clean consumer's `lint` script (no live violations — not engine/html-reporter before U5) with the probe file `tests/__lint-probe__/two-run-probe.ts` pasted invalid then valid, then deleted | R7                                                                          |
| Inversion probe           | swap the two-run/andThen fixture pair, run the plugin test, restore                                                                                                                            | R8                                                                          |
| Monorepo gate             | `pnpm check:local` (after the last edit)                                                                                                                                                       | R9 and no collateral damage                                                 |
| Revert probe              | revert one live-site migration, observe its package lint exit non-zero, restore                                                                                                                | the migration is not the success; the rule is                               |

---

## Definition of Done

- Every acceptance criterion in the originating issue holds, each citable with a command and exit code: the five verification (1)–(5) items — fixtures are the evidenced shapes (not a toy `foo(); bar()` pair), the recommended map carries both rules at `error` with a consumer red on a pasted chain, no `it.skip`/swallowed diagnostic/consumer-side disable anywhere, the valid `andThen` fixture passes with the two-run invalid fixture deleted, and `Cell.run` remains exported and callable on a single Cell.
- Both live sites migrated; `pnpm check:local` exits 0 after the last edit; the revert probe shows the gate, not the migration, is what holds the line.
- No `warn`, no dated baseline, no rule disabled in a consumer config, no doctrine paragraph substituting for the gate.
- Changesets present for both publishable packages; branch committed and shipped as a PR watched to green.
- No abandoned-attempt code left in the diff: probe fixtures pasted for U4 are reverted, and any helper added to `cell.ts` is used by both rules or not added.
