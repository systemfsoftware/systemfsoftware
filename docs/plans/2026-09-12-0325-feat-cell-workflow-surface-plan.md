---
title: Cell and Workflow Surface Completion - Plan
type: feat
date: 2026-09-11
topic: cell-workflow-surface
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Cell and Workflow Surface Completion - Plan

## Goal Capsule

- **Objective:** An author migrating an application onto the cell architecture can express conditional execution, per-item aggregation, total decisions, and chained decisions as typed library forms. Separately: the two invariants previously enforced by review alone (variant reachability, runtime-construction placement) fail CI instead of compiling as costumes.
- **Means:** Extend `packages/effect-cell-types` (KTD1, KTD2, KTD3), widen the make-boundary kernel and ship two lint rules (KTD4, KTD5), and settle the cell operation surface per the grain ruling: the exported `Cell.run` alias is deleted, arrow application (`cell.run(input)`) is the lawful work form everywhere, and runtime construction (wiring closure) is lint-gated (KTD6).
- **Product authority:** GitHub issues #393, #394, #395 on `systemfsoftware/systemfsoftware` (amended 2026-09-11), as refined by the Key Decisions below.
- **Open blockers:** none.
- **Stop conditions:** the `UnsharedTypeId` repair exceeding type-level scope (see Risks).

---

## Product Contract

Product Contract preservation: Problem Frame reworded to track the amended issues; R14 added for the user-selected migration scope; OQ2 and OQ3 resolved by planning (KTD3, KTD5); R-IDs R1–R13 unchanged.

### Summary

Complete the cell/workflow type surface and close its unenforced invariants. `effect-cell-types` gains a total-decision constructor, a composite-workflow constructor, and `gate`/`collect` Cell combinators — all four shapes compile-verified by a spike against the real package source — and loses the exported `Cell.run` alias, a one-line rename of `self.run(input)` with no behavior. The oxlint fleet gains variant-reachability and runtime-construction rules on a widened make-boundary kernel; every existing `Cell.run` call site becomes arrow application with its position and semantics untouched.

### Problem Frame

The trigger is a real migration: moving `omp-claude-compat` onto the cell architecture hit the type surface's edges in two places. Its referenced-file loader hand-writes a dynamic-N read with per-item skips as bare `null` returns in shell Effect code, because no `collect` or `gate` combinator exists. That hand-written form stays typed through Effect's own channel inference, but it is invisible to every rule and audit that keys off the Cell brand — the shape stops being a node any tooling can see. Its hook-verdict workflow carries three genuinely total sub-decisions as plain if/else string-union functions, because `Workflow.make` rejects a `never` error channel unconditionally — so those decisions get no brand, no `Match.tag` dispatch, and no marker discipline, and the chains between them are wired ad hoc inside the decide body where the composite's signature hides inner refusals.

Separately, two architecture invariants are enforced by review alone: a workflow may declare error variants no code path constructs, and runtime construction (wiring closure, launch) may sit anywhere. The construction-placement invariant is a new decree, not an existing one — no constitution rule or package doc states it today, and its statically decidable half is what this arc ships. Issue #395's purity claim, amended to credit `make-body-purity`, remains contradicted by verified code: `no-io-in-phase-bodies` already covers the `Cell.layer` decode/decide/encode spec bodies, derives its phas…

### Key Decisions

- **#395 rescoped per the grain ruling: variant reachability ships as lint; placement narrows to what is statically decidable.** The purity invariant the issue asked to enforce is already enforced by the vocabulary-derived `no-io-in-phase-bodies` rule. The original `Cell.run`-keyed placement rule is dead: `Cell.run` is arrow application (R stays open and flows to the enclosing Effect) — composition, not interpretation — and a rule keyed on its identifier bans lawful work while missing launch and wiring. The reductio: `Cell.andThen`'s own implementation calls the inner cell's `run`, so an identifier-keyed rule flags the library that defines the combinators. (session-settled: user-directed, TCR-settled 2026-09-12 — chosen over the interpret alias (two names, one operation: compliance = renaming until grep is clean), over cli-only enrollment (grandfathering), and over broadened roots (root means nothing by redefinition).) Governs R9, R10, R11, R14.
- **#394 keeps both halves — total constructor and composite constructor.** The composite completes the Workflow type's algebra the way `andThen` completes Cell's, at the decision altitude: `Cell.andThen` composes sandwiches with their own I/O phases, the composite composes pure decisions inside one decide slot, and the two are not substitutes. (session-settled: user-directed — chosen over cutting the composite as speculative: chains of branded total workflows are unobservable precisely because #394a's absence suppresses them, and the migration already wires such chains ad hoc.) Governs R1, R2, R3, R4.
- **Library and lint only; the omp-claude-compat migration validates downstream.** Acceptance criteria stay package-local as the issues wrote them. (session-settled: user-directed — chosen over migration-shaped acceptance fixtures and a full-arc migration PR: the proving ground lives in the `omp-claude-compat` repo on its own schedule.)
- **The CONCEPTS.md wording correction rides with this arc.** The `Description` entry's claim that the purity rule reads "the call graph reachable from the body" is corrected to the rule's actual "written inside" reach, in its own commit — CONCEPTS.md is a Doctrine surface. (session-settled: user-directed — chosen over leaving it for a docs pass: the arc already touches the rule the line describes, and doctrine drift compounds.) Governs R13.
- **Runtime construction is lint-gated exactly where it is statically decidable; the rest is review.** Three shipped mechanisms: `*Live` outside application packages stays on the existing PROD-LIVE1 package-kind lint; `ManagedRuntime.make`/`Layer.provide`/`Cell.provide` inside a function body (make-per-call: wiring per request) fails at error with no baseline; eager module-scope runtime construction (a `ManagedRuntime.make` at top level, not lazy + memoized) fails at error, the same family as `schema-declaration-location`. The provision/closure-outside-declared-root rule does NOT ship until a `compositionRoot` field exists in declared package metadata — an unshipped rule is honest; an advisory rule is a lie with paperwork — and one-closure-per-process plus interpretation-at-edges stay review-gated (the SF2 human tier). Module-level memoized runtime variables and lazy bootstrap closures are the sanctioned shapes. (session-settled: user-directed, TCR-settled 2026-09-12 — chosen over filename-keyed roots, over import-origin edge detection, and over warn/advisory severities: warn-severity-is-dominated; migration is error + dated baseline, undecidable is review, decided-against is off with the rule named.) Governs R10.
- **Delivery sequence: #394, then #393, then #395.** The new total constructor changes what the existing make-keyed workflow rules must recognize as lawful, so the lint unit lands last and verifies that recognition. The two library deliveries share a package but ship as separate commits with separate changesets. The two shipped lint rules share no substrate — R9 keys on the workflow-construction boundary, R10 on runtime-construction shapes — so they may ship as independent deliveries, both as siblings in the existing plugin packages; no new plugin package is created.

### Requirements

**Workflow constructors (#394)**

- R1. A total-decision constructor brands a decide function returning at least two tagged decision variants sharing one TypeId with error channel `never`; it reuses the existing `SingleVariantDecision`/`UntaggedDecision`/`UnsharedTypeId` markers, so a single-variant total function still fails with `SingleVariantDecision`.
- R2. `Workflow.make` behavior is unchanged: a `never` error channel still fails with `UninhabitedError`, covered by a regression type test.
- R3. A composite-workflow constructor wires one workflow's decision output into the next workflow's command by declared dispatch; its error channel is inferred as the union of its components' error channels, and its public signature admits no adapter-lambda parameter.
- R4. Both constructors are accepted by `Cell.layer`'s decide slot without casts, proven by an integration test, not only isolated type tests.

**Cell combinators (#393)**

- R5. A `gate` combinator runs a cell only when a preceding read produces `Option.some`, yielding `Cell<I, Option<A>, E, R>` with the read's E and R channels unioned in; on skip the result is `Option.none` and the inner cell's `read` and `write` demonstrably never execute (runtime test, not type test alone).
- R6. A `collect` combinator maps each item of a collection to a cell and folds all results with an unbranded pure function, yielding `Cell<readonly Item[], B, E, R>` with item-level channels unioned; the fold's signature carries no `WorkflowBrand`.
- R7. Collect's refusal policy ships both named forms per the Key Decision: `collect` as the fail-fast default fails the cell on an item refusal, and `collectAll` (directional name per KTD3) as the accumulate opt-in delivers all per-item results — refusals included — to the fold; each form is tested on an all-success run and a run containing a refusal.
- R8. Neither combinator's public signature nor use sites require `WorkflowBrand`; both match the existing dual curried/data-first style of `map`/`andThen`/`zip`/`provide` and are exported from the package's public surface beside `andThen`/`zip`.

**Lint rules (#395, rescoped)**

- R9. A variant-reachability rule fails lint when a variant declared in a workflow's decision or error union is never constructed in that file, and stays silent when every declared variant is constructed; construction is read from constructor call sites in the file, not from the union declaration. A filename may select which files the rule visits; the construction boundary, widened per KTD4, decides every verdict.
- R10. Runtime construction is lint-gated where statically decidable: (a) `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` called inside a function body fails — wiring per request is a runtime per request; (b) eager module-scope runtime construction — a `ManagedRuntime.make` evaluated at import time instead of inside a lazy, memoized bootstrap closure — fails. Both at error, no baseline. `Cell.run` and `cell.run(input)` arrow application are unrestricted: R-open arrow application is the doctrine's sanctioned composition. The lawful lazy-memoized bootstrap shape is documented in the rule. Provision outside a declared composition root is review-gated (SF2 tier) until package metadata declares roots; the rule does not exist until then.
- R11. Both rules ship with RuleTester fixtures that prove the rule fails the lint run on the costume shape and stays silent on lawful shapes — including `andThen` composition, pure Schema transforms, test files, and workflows built with the new constructors; all pre-existing plugin rules still pass, and the existing make-keyed workflow rules are verified to accept the constructors of R1 and R3 as lawful workflow construction. For R10 the lawful set explicitly includes the lazy-memoized bootstrap closure and every mid-tree arrow application.

**Migration**

- R14. The exported `Cell.run` alias is deleted from `effect-cell-types` — it is a one-line rename of `self.run(input)` with no behavior — and every call site in the tree becomes arrow application (`cell.run(input)`) with position and semantics untouched: the eleven verified sites in `stryker-js-cli` (`Output.ts:430`, `Survivors.ts:213`), `stryker-js-engine` (`Checker.ts:525`, `:576`, `Run.ts:1317-1319`), `stryker-js-typescript-checker` (`Checker.ts:127`, `:135`, `:156`), `stryker-js-vitest-runner` (`Runner.ts:1286`), and `effect-daemon-spec` (`SupervisorBodyExecutor.ts:211`, `:295`) are lawful work applications and stay where they are. No hoisting, no renames, no grandfathering. The doctrine row stating `Cell.run` happens once at the composition root with R = never is deleted with the alias — U8's sites falsified it.

**Release and gates**

- R12. Each publishable package whose build hash changes ships a `.changeset/` intent per repo law: `effect-cell-types` and the owning plugin packages as feature bumps, plus the migrated stryker-js packages (the `make-boundary` kernel is `private: true` and ships no intent); each owning package's typecheck, lint, and test scripts exit 0 as the gatekeeper criterion from the issues.

**Doctrine**

- R13. `CONCEPTS.md`'s `Description` entry is corrected so its phase-purity sentence names the rule's actual reach — I/O written inside the body or a same-file module-level helper the body calls, transitively, with closure-captured bindings and imported helpers stated as the honest bound — matching the rule's own scope note, in a commit of its own with no code change beside it.

### Acceptance Examples

- AE1. **Covers R5.** Given a gate whose preceding read yields `Option.none`, when the composed cell runs, then the result is `Option.none` and instrumentation shows the inner cell's `read` and `write` never executed.
- AE2. **Covers R5.** Given the read yields `Option.some(x)`, when the composed cell runs, then the inner cell executes on `x`, the result is `Option.some(a)`, and the read's error and requirement channels appear in the result type.
- AE3. **Covers R7.** Given a fail-fast collect over N items where item k's cell refuses, when the composed cell runs, then the cell fails with item k's refusal and the fold never runs.
- AE4. **Covers R7.** Given an accumulate collect over N items where item k's cell refuses, when the composed cell runs, then the fold receives all N per-item results including item k's refusal as data.
- AE5. **Covers R1, R4.** Given a decide function returning two tagged variants sharing a TypeId with error channel `never`, when branded with the total constructor, then it is accepted by `Cell.layer`'s decide slot with no casts.
- AE6. **Covers R1.** Given a total function returning a single variant, when passed to the total constructor, then compilation fails with the existing `SingleVariantDecision` marker.
- AE9. **Covers R10.** Given `ManagedRuntime.make` inside a function body, when linted, then the rule fails the run; the lazy-memoized bootstrap closure at module scope passes; `cell.run(input)` in any module passes.
- AE10. **Covers R1.** Given a total function returning two tagged variants carrying different TypeIds, when passed to the total constructor, then compilation fails with the existing `UnsharedTypeId` marker.

### How This Work Fits Together

<!-- ce-section: work-relationships -->

This plan owns the library and lint arc across issues #393, #394, and the rescoped #395, plus the alias-deletion sweep that arc's grain ruling makes necessary. The broader breakdown below is current understanding, not a committed roadmap.

- **omp-claude-compat migration to the cell architecture** (separate repo: `systemfsoftware/omp-claude-compat`)
  - Depends on this plan: its untyped loader and unbrandable total sub-decisions are the motivating evidence, and it adopts the new forms once published — its adoption is this arc's downstream validation signal, tracked as a follow-up issue in that repo when this plan lands; the arc's own Definition of Done is not gated on it.
  - Can proceed independently of this plan only by continuing to hand-write the shapes this plan types.
- **Phase-purity coverage extension** (`yield*`, `Date.now`, `Math.random` in the existing `no-io-in-phase-bodies` rule)
  - Still to decide: cut from #395 with the rescope; a future audit may reopen it.

### Scope Boundaries

- Changes to `Workflow.make`'s existing markers — R2 pins them as unchanged.
- Per-variant fan-out composition (routing different decision variants to different next workflows) — a different algebra nobody has asked for.
- The provision/closure-outside-declared-root rule — does not ship until package metadata declares composition roots; until then the property is review-gated (KTD5, R10). When the metadata field exists, the rule lands at `error` with an explicit dated baseline enumerating that day's closure sites, shrinking monotonically.
- Any launch-site or edge-placement rule — interpretation cardinality and edge-ness are runtime properties; they stay on the SF2 review tier.

#### Deferred to Follow-Up Work

- The `omp-claude-compat` migration itself — validates downstream in its own repository and PR.
- Any new or extended phase-purity rule — the invariant is already enforced; coverage extension is cut per the #395 rescope.
- A purity rule covering `Effect.*` constructors beyond the vocabulary's `ioCells` classification — same cut.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Total constructor: marker on the decider's return, command-class arity.** The decider's return type carries `Result<D, never> & DecisionShape<D>` — a parameter-position conditional collapses to `unknown`, a measured trap. The constructor takes the command class value first, exactly like `make`, so the command channel stays pinned to the class rather than an inferred annotation. It ships inside `Workflow.ts`: the brand is module-internal, and a consumer-side brander fails with `not assignable to type 'WorkflowBrand'`. (session-settled: user-approved — chosen over the decider-only arity: the spike proved both compile, and the class arity preserves the command no-leak property.) Governs R1, R2.
- KTD2. **Composite: wrapper-command chain, spike-verified.** The downstream workflow's command class declares a `decision` field over the upstream decision union; the composite receives both command classes and both workflows as values and constructs the wrapper internally — no adapter lambda exists in the signature. The error channel infers as `E1 | E2` and the first component's refusal short-circuits via `Result.flatMap`. Parameters are spelled as expanded intersections (`((command: C) => Result<D, E>) & WorkflowBrand`) because the `Workflow` alias is a deferred conditional and not callable under generic channels. (session-settled: user-approved — chosen over union-as-command, a dispatch table, and a Match-body: union-as-command is proven impossible (TS2739: a union is not a `Schema.Class` value), and an adapter lambda is an unbranded decide.) Governs R3, R4.
- KTD3. **Both combinators ship inside `Cell.ts`; gate is two-cell, collect is one-cell-per-item, sequential.** `Cell`'s `make` is module-private, so no consumer-side assembly exists; both combinators follow the shipped `dual(2, …)` overload template of `andThen`/`zip`. `gate(reader, inner)` takes a reader cell producing `Option<Raw>` and an inner cell consuming `Raw`; a skip propagates `Option.none` and an inner refusal propagates as a failure, never as `none`. `collect(cell, fold)` runs one cell per item in iteration order — sequentially, so the interruption question dissolves; the fail-fast form's fold receives `readonly A[]` and runs only when every item succeeded; the accumulate form's fold receives `readonly Result<A, E>[]`; an empty collection hands the fold `[]`. The accumulate form's name is directional: `collectAll`. Governs R5, R6, R7, R8.
- KTD4. **The make-boundary kernel widens to a declared constructor-member set.** `packages/oxlint-plugin/make-boundary/src/MakeBoundary.ts` hard-codes the member name `make`; it becomes a declared set (`make`, `total`, `andThen`), and every make-keyed rule keeps keying on the boundary — never a filename, which is the retired unfalsifiable key. `workflow-file-make-presence` relaxes to "constructed with a recognized constructor," so a file built purely with the composite is not falsely reported. Governs R9, R11.
- KTD5. **The grain table governs placement enforcement.** Wiring closure (`ManagedRuntime.make`, `Layer.provide`/`merge` chains, `Cell.provide`) is once per process and lives in the application package's root module, lazily memoized; interpretation (`runtime.runPromise`/`runFork`, `Layer.launch` for daemons) is once per outside interaction at SF2 intercepts, review-gated; work (`cell.run(input)`, `yield*`) is per input and lawful anywhere in composition. Lint enforces only the statically decidable rows: make-per-call, eager construction, and PROD-LIVE1 (existing). Cardinality and edge-ness are runtime properties; a static rule approximating them degenerates into an allowlist, so they are review rows, honestly. Governs R10.
- KTD6. **Rules land at `error`; the construction rules enroll tree-wide on landing.** Both rules land at `error` severity — `warn` fails no command in this repo and an advisory rung does not exist. The runtime-construction rule's lawful-instance count is zero on today's tree (verified by corpus probe at U7), so enrollment carries no grandfathered debt; if the probe finds an instance, it is fixed or given an explicit dated baseline before landing — never warn, never advisory. Governs R10, R14.
- KTD7. **Test-layer map.** Type claims are tstyche assertions in `test-types/*.tst.ts`; behavior claims are gherkin composition tests through `Cell.run` in `tests/` using the trace-array pattern (observation is a local closure, never a service); lint rules get RuleTester costume/lawful pairs with per-fixture comments naming the mutant each case kills. Symbol-keyed negatives tstyche cannot assert are pinned by the package's own `tsc` compile sweep. Every proposed test runs in-process through a published surface — no process spawns, no test-born exports. Mutation runs in CI only (REPO-D3).

### High-Level Technical Design

The composite's mechanics (KTD2), compile-verified by the spike:

```mermaid
flowchart TB
  CA[CommandA class] --> MA[workflow A: decideA]
  MA --> RA["Result&lt;DecisionA, E1&gt;"]
  RA -->|refusal| OUT["composite fails: E1 | E2"]
  RA -->|DecisionA value| WRAP["new CommandB({ decision })"]
  WRAP --> MB[workflow B: decideB]
  MB --> RB["Result&lt;DecisionB, E2&gt;"]
  RB --> OUT2["composite succeeds: DecisionB"]
```

Unit dependencies and delivery order:

```mermaid
flowchart TB
  U1[U1 total constructor] --> U2[U2 composite constructor]
  U2 --> U5[U5 widen make-boundary]
  U5 --> U6[U6 reachability rule]
  U5 --> U7[U7 runtime-construction rule]
  U9[U9 CONCEPTS.md fix — independent]
  U7 --> U8[U8 alias deletion: sites become arrow applications]

### Sequencing

Four deliveries, per the settled Key Decision: (1) U1 then U2 — issue #394; (2) U3, U4 — issue #393; (3) U5, then U6 and U7 — issue #395; (4) U8, the alias-deletion sweep across the consumer packages, landing with the construction rule enrolled tree-wide. U9 lands at any point as its own `docs:` commit. Each library or plugin delivery ships its own changeset per R12.

### Alternatives Considered

- **Union-as-command for the composite** — rejected, compile-verified: TS2739, a union schema is not a `Schema.Class` value.
- **`Schema.Class`-typed constructor parameter** — rejected, compile-verified: TS2345 twice; the class constructor returns the struct, and its props type is a deferred conditional generics cannot relate.
- **Field name as a type parameter** — rejected, compile-verified: TS2345, a computed generic key yields a string index signature.
- **Caller-side branding (unbranded composer + `make` at each call site)** — rejected: compiles, but `make-body-purity` refuses the composed call, so the constructor must live in the library.
- **Dispatch table or Match-body for the composite** — rejected in dialogue; the wrapper-command chain needs neither.
- **Whole-graph guard script for placement** — rejected: placement is per-file decidable given a configured designation, and a lint rule sits where the fleet's other placement invariants live.
- **`Cell.run`-keyed placement rule (entry-basename designation)** — shipped, then killed by the grain ruling: `Cell.run` is arrow application — R stays open and flows to the enclosing Effect — so an identifier-keyed rule bans lawful work (the supervisor's per-crash restart cells, the checker's per-round cells) while missing launch and wiring; the reductio is `Cell.andThen` calling the inner cell's `run`.
- **Interpret alias for mid-tree runs** — rejected: two names for one operation; compliance is renaming until grep is clean — check-gaming institutionalized.
- **Provision/closure rule keyed on filenames or import-origin** — rejected: root modules, process counts, and edge-ness are runtime or conventional properties; a static rule approximating them degenerates into an allowlist. Error + declared-metadata baseline, or review — nothing between.


| Risk | Mitigation |
|---|---|
| The `UnsharedTypeId` marker fired no diagnostic in the spike on two variants with different TypeIds — R1's marker reuse may inherit a toothless marker | U1 pins the marker with a compile-sweep test; if the pin shows it dead, repair the marker (produced by the private `SharedTypeId` helper) inside U1 (type-level only) |
| A migration site proves to be a legitimate composition root | Superseded by the grain ruling: arrow application is lawful anywhere; construction placement is governed by KTD5's statically decidable rows |
| `make-boundary` has no test suite of its own (it is a bundled kernel, not a plugin) | Widening is verified through the consumer rules' fixture suites, green before and after; the widening commit is observed red first (a recognition fixture fails pre-widening) |
| The entrypoint plugin's EP1 gate counts the configs carrying the entry designation; the shipped `cell-run-placement` rule added a fourth and is now deleted | Deleting the rule restores the three-config gate expression; the EP1 pin is verified unchanged after U7's rewrite |
| The new rules sit inside `packages/oxlint-plugin`, which the author of a judged workflow can edit | Standing repo discipline (CONST-E9, Evaluator surface class) already governs; no new mechanism in this plan |

### Sources

- Compile-verified spike (untracked scratch; deleted before the first lint run per Definition of Done): `packages/effect-cell-types/spike/` — `chain-structural-ctor.workflow.ts` is the composite's proven shape, `probe/E2-total.ts` the total constructor's, `expect-fail/` the captured dead ends.
- Rule-authoring law: `packages/oxlint-plugin/AGENTS.md` (OX-TS1/TS2, OX-RT1, OX-MG1, topology) and `packages/oxlint-plugin/oxlint-plugin-effect-entrypoint/AGENTS.md` (EP1).
- Pattern sources: `packages/effect-cell-types/src/Cell.ts:172-243` (the `dual(2, …)` template), `packages/effect-cell-types/test-types/Workflow.tst.ts` (tstyche idiom), `packages/effect-cell-types/tests/interpreter.integration.test.ts` (trace-array composition tests), `packages/oxlint-plugin/oxlint-plugin-cell-vocabulary/src/rules/__tests__/no-io-in-phase-bodies.test.ts` (RuleTester convention).
- Learnings: `docs/solutions/architecture-patterns/constructor-rule-boundary.md` (parameter-position trap; a type retires no rule), `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` (no filename keys), `docs/solutions/architecture-patterns/typed-overloads-need-a-keyless-union.md` (the overload shape), `docs/solutions/architecture-patterns/phantom-marks-are-donatable.md` (marker tests name the resolved type, never assignability), `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` (error, never warn), `docs/solutions/build-errors/composition-root-cannot-self-detect-as-entry.md` (designation canon).
- Migration sites: `packages/stryker-js/stryker-js-typescript-checker/src/Checker.ts:126-158`, `packages/stryker-js/stryker-js-vitest-runner/src/Runner.ts:1285-1292`, `packages/stryker-js/stryker-js-engine/src/Run.ts:1311-1320` — under R14 these sites change call form only (`Cell.run(x, y)` → `x.run(y)`); the entry exemplar is `packages/stryker-js/stryker-js-cli/src/main.ts`.

---

## Implementation Units

### U1. Total-decision constructor

- **Goal:** `Workflow.total` brands a never-failing multi-variant decision, reusing the existing markers.
- **Requirements:** R1, R2; AE5, AE6.
- **Dependencies:** none.
- **Files:** `packages/effect-cell-types/src/Workflow.ts`, `packages/effect-cell-types/test-types/Workflow.tst.ts`, `packages/effect-cell-types/test-types/Cell.tst.ts` (decide-slot acceptance probe).
- **Approach:** Follow KTD1. Reuse the fixture decision family in `packages/effect-cell-types/tests/__fixtures__/Decision.schema.ts`. The marker chain for this constructor resolves `DecisionError = never` as the accepted case, with `SingleVariantDecision`/`UntaggedDecision`/`UnsharedTypeId` still firing. Ship with a `minor` changeset for `effect-cell-types` per R12.
- **Execution note:** Start from the spike's proven signature (`packages/effect-cell-types/spike/probe/E2-total.ts`) and implement the type tests first.
- **Test scenarios:**
  - Covers AE5. A two-variant total decision brands and is accepted by `Cell.layer`'s decide slot — tstyche plus a `Cell.tst.ts` integration probe.
  - Covers AE6. A single-variant total function fails with `SingleVariantDecision` — tstyche.
  - Untagged variants fail with `UntaggedDecision` — tstyche.
  - `Workflow.make` with a `never` error channel still fails with `UninhabitedError` — regression tstyche assertion (R2).
  - Covers AE10. Two variants with different TypeIds are probed under the package's own `tsc` sweep — this pins the spike's toothless-`UnsharedTypeId` finding; if the pin shows the marker dead, repair the marker (produced by the private `SharedTypeId` helper) in this unit (type-level only).
- **Verification:** `pnpm --filter @systemfsoftware/effect-cell-types typecheck`, `test`, and `test:types` exit 0.

### U2. Composite-workflow constructor

- **Goal:** `Workflow.andThen` chains two workflows with an inferred error-channel union and no adapter lambda.
- **Requirements:** R3, R4; AE7.
- **Dependencies:** U1.
- **Files:** `packages/effect-cell-types/src/Workflow.ts`, `packages/effect-cell-types/test-types/Workflow.tst.ts`, `packages/effect-cell-types/tests/` (runtime short-circuit scenario), `packages/effect-cell-types/test-types/Cell.tst.ts` (decide-slot acceptance probe).
- **Approach:** Follow KTD2 and the spike's `spike/chain-structural-ctor.workflow.ts` shape. The downstream command class declares the `decision` field over the upstream decision union. Parameters are spelled as expanded intersections, not the `Workflow` alias.
- **Execution note:** Type tests first; the spike's `expect-fail/` directory already carries the dead ends to re-derive as negative assertions.
- **Test scenarios:**
  - A two-workflow chain compiles with the error channel inferred as the union — tstyche; a hand-narrowed error-channel annotation is rejected (control).
  - Covers AE7. First-component refusal short-circuits: the second workflow never executes — gherkin composition test with the trace-array pattern.
  - A consumer matching on the first component's refusal variant compiles without casts — tstyche.
  - The composite is accepted by `Cell.layer`'s decide slot — `Cell.tst.ts` integration probe (R4).
  - A downstream command class lacking the `decision` field is rejected — tstyche.
- **Verification:** same three package scripts as U1 exit 0.

### U3. `Cell.gate` combinator

- **Goal:** Conditional cell execution with the skip visible as `Option.none`.
- **Requirements:** R5, R8; AE1, AE2.
- **Dependencies:** none (touches only `Cell.ts`; the Sequencing section ships it with #393 independently of U1).
- **Files:** `packages/effect-cell-types/src/Cell.ts`, `packages/effect-cell-types/test-types/Cell.tst.ts`, `packages/effect-cell-types/tests/interpreter.integration.test.ts` (or a documented sibling).
- **Approach:** Follow KTD3. Two-cell form `gate(reader, inner)`; implement via the module-private `make`, run-wrapping like the six existing arrows. An inner refusal propagates as a failure, never as `none`.
- **Test scenarios:**
  - Covers AE1. Skip: the reader yields `Option.none`; the result is `Option.none` and the trace array shows the inner cell's `read` and `write` never ran — gherkin composition test.
  - Covers AE2. Run: the reader yields `Option.some(x)`; the inner cell executes on `x` and the result is `Option.some(a)` — composition test; the reader's E and R channels union into the result type — tstyche.
  - Inner refusal propagates as the composed cell's failure, not `Option.none` — composition test.
  - Both dual forms compile; no `WorkflowBrand` appears in the signature — tstyche (R8).
- **Verification:** same three package scripts exit 0; changeset per R12.

### U4. `Cell.collect` combinator, both refusal regimes

- **Goal:** Dynamic-N per-item execution with an unbranded fold, in a fail-fast default form and a named accumulate form.
- **Requirements:** R6, R7, R8; AE3, AE4.
- **Dependencies:** none (touches only `Cell.ts`; the Sequencing section ships it with #393 independently of U1).
- **Files:** `packages/effect-cell-types/src/Cell.ts`, `packages/effect-cell-types/test-types/Cell.tst.ts`, `packages/effect-cell-types/tests/interpreter.integration.test.ts` (or the same sibling as U3).
- **Approach:** Follow KTD3. One cell per item, sequential in iteration order. `collect(cell, fold)` fails on the first item refusal and its fold receives `readonly A[]` only on full success; the accumulate form's fold receives `readonly Result<A, E>[]`. An empty collection hands the fold `[]`.
- **Test scenarios:**
  - N items run the inner cell exactly N times and the fold receives all N results — composition test with the trace array.
  - Covers AE3. Fail-fast: item k's refusal fails the cell with that refusal and the fold never runs.
  - Covers AE4. Accumulate: a run containing a refusal delivers all N per-item results to the fold, refusals as data.
  - Empty collection: both regimes hand the fold `[]` — composition test.
  - Item-level E and R channels union into the result type; the fold's signature carries no `WorkflowBrand` — tstyche (R6, R8).
- **Verification:** same three package scripts exit 0; changeset per R12 (one feature bump covering U3 and U4 is acceptable if they ship in one delivery).

### U5. Widen the make-boundary kernel

- **Goal:** Every make-keyed rule recognizes `total` and `andThen` as workflow constructors.
- **Requirements:** R11 (the recognition half); enables R9.
- **Dependencies:** U2.
- **Files:** `packages/oxlint-plugin/make-boundary/src/MakeBoundary.ts`, `packages/oxlint-plugin/oxlint-plugin-effect-workflow/src/rules/__tests__/` (existing suites' lawful fixtures extended, including `make-file-location`'s).
- **Approach:** Follow KTD4. Replace the hard-coded member name with a declared constructor-member set. `workflow-file-make-presence` relaxes to "constructed with a recognized constructor." The kernel's documented bound (re-export chains are not followed) is restated where the member set is declared.
- **Execution note:** Evaluator-surface discipline: this commit is observed red first — a fixture building a workflow with `total` or `andThen` fails `workflow-file-make-presence` before the widening, passes after.
- **Test scenarios:**
  - Pre-widening: a `*.workflow.ts` built only with the composite constructor is falsely reported as missing a construction — captured as the red observation.
  - Post-widening: that file passes; a composite-only file counts as one construction site, and a file constructing with both `make` and `andThen` still holds two decisions and still fails the one-construction-per-file rule.
  - All pre-existing make-keyed rule suites pass unchanged.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow test` and `typecheck` exit 0.

### U6. Variant-reachability rule

- **Goal:** A declared decision or error variant that no code path constructs fails lint.
- **Requirements:** R9, R11; AE8.
- **Dependencies:** U5.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-effect-workflow/src/rules/workflow-variant-constructed.ts` and `.config.ts` (names directional), `src/rules/__tests__/`, `src/index.ts` registration and recommended config, the plugin README's rule table.
- **Approach:** Keyed on the widened construction boundary (KTD4), never the filename. Declared variants are read from the named union alias and from the decider's inline `Result.Result<A | B, E>` return annotation — both forms occur in the corpus. Construction is recognized as `new X(…)` and `X.make(…)` call sites in the same file. The message states the rule's exact reach (in-file construction sites only), following the message-discipline pattern of the cell-vocabulary plugin.
- **Test scenarios (RuleTester pairs, each fixture commenting the mutant it kills):**
  - Covers AE8. Costume: a declared error-union variant never constructed fails the run; the same file with the variant constructed passes.
  - Lawful: a decision union declared as a named alias and one declared inline in the decider's return annotation are both read.
  - Lawful: workflows built with `total` and `andThen` (post-U5 recognition).
  - Lawful: a variant constructed via `X.make(…)` counts as constructed.
- **Verification:** the plugin's `test`, `typecheck` (both tsconfig passes), and `lint` scripts exit 0; changeset per R12.

### U7. Runtime-construction rule (replaces the deleted `cell-run-placement`)

- **Goal:** Wiring per request and eager runtime construction fail lint; arrow application and lazy-memoized bootstraps stay lawful.
- **Requirements:** R10, R11; AE9.
- **Dependencies:** U5.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-effect-entrypoint/src/rules/` — the shipped `cell-run-placement` rule, its config, and its fixtures are deleted (clean cutover, never enrolled); the replacement rule lands in their place with its own `.config.ts` and fixtures; `src/index.ts`, the plugin README's rule table, and the plugin `AGENTS.md` EP1 pin (verified restored to the three-config gate expression).
- **Approach:** Follow KTD5. One rule, two verdicts, both `error`: (a) `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` inside a function body — wiring per request; (b) `ManagedRuntime.make` evaluated at module top level instead of inside a lazy, memoized bootstrap closure — eager construction. Callers are resolved through their import specifier (the `effect` and `@systemfsoftware/effect-cell-types` namespace/member idiom), never identifier text; aliased imports resolve the same. The lawful lazy-memoized bootstrap shape is documented in the rule's docs. The corpus probe must report zero findings on tracked files before the rule enters the recommended config (KTD6); a finding is fixed or given an explicit dated baseline — never warn, never advisory.
- **Test scenarios (RuleTester pairs, each fixture commenting the mutant it kills):**
  - Covers AE9. Costume: `ManagedRuntime.make` inside a function body fails; `Layer.provide` inside a function body fails; `Cell.provide` inside a function body fails.
  - Costume: `ManagedRuntime.make` at module top level fails (eager).
  - Lawful: `ManagedRuntime.make` inside a module-scope lazy memoized bootstrap closure passes.
  - Lawful: `cell.run(input)` and `Cell.run`-style arrow application in any module, at any depth, pass — including inside `Effect.gen` bodies and library combinator internals.
  - Lawful: aliased imports (`Effect as Efx`) still resolve — the mutation pin for the resolver.
- **Verification:** the plugin's `test`, `typecheck`, and `lint` scripts exit 0; changeset per R12; corpus probe zero findings on tracked files; enrollment in the recommended config lands with the rule.

### U8. Alias deletion: the eleven sites become arrow applications

- **Goal:** The exported `Cell.run` alias is gone; every call site is arrow application with position and semantics untouched; the construction rule is enrolled green.
- **Requirements:** R14.
- **Dependencies:** U7 (for the enrolled-rule corpus probe).
- **Files:** `packages/effect-cell-types/src/Cell.ts` (the `dual(2, …)` alias, its TSDoc, and any mod.ts mention), the package's test files and type tests that call the alias, `README.md`, `etc/effect-cell-types.api.md`, the package `AGENTS.md` if it names `Cell.run`, and the eleven consumer sites: `stryker-js-cli/src/Output.ts:430`, `Survivors.ts:213`, `stryker-js-engine/src/Checker.ts:525` and `:576`, `Run.ts:1317-1319`, `stryker-js-typescript-checker/src/Checker.ts:127`, `:135`, `:156`, `stryker-js-vitest-runner/src/Runner.ts:1286`, `effect-daemon-spec/src/internal/SupervisorBodyExecutor.ts:211` and `:295`, plus the library-name import each site drops if unused.
- **Approach:** Delete the alias from the library first, rebuild, then sweep the call sites mechanically: `Cell.run(cell, input)` → `cell.run(input)` — no hoisting, no restructuring, no renames; the sites are lawful work applications under the grain table. The doctrine row stating `Cell.run` happens once at the composition root with R = never is deleted wherever it lives (grep `CELL-L4` and "composition root" across doctrine surfaces).
- **Execution note:** Characterization first: each affected package's existing suite runs green before the sweep; it is the guard that the call-form change is behavior-neutral.
- **Test scenarios:**
  - Each affected package's existing test suite passes unchanged after the sweep.
  - The enrolled runtime-construction rule reports zero findings on tracked files tree-wide.
  - `pnpm --filter @systemfsoftware/effect-cell-types test:types` green with the alias absent — the type tests now pin the arrow form.
- **Verification:** the five consumer packages' `test` and `typecheck` scripts exit 0; repo-wide grep for `Cell.run(` returns only the deleted alias's absence; the construction rule enrolled reports no findings.

### U9. CONCEPTS.md wording correction

- **Goal:** The `Description` entry's phase-purity sentence matches the rule it describes.
- **Requirements:** R13.
- **Dependencies:** none.
- **Files:** `CONCEPTS.md`.
- **Approach:** Rewrite the sentence to the rule's actual reach per R13's wording. Its own commit, no code change beside it; commitlint's `type-matches-diff-shape` forces a `docs:` type.
- **Test scenarios:** Test expectation: none — doctrine text only.
- **Verification:** `pnpm check:local` exits 0 after the edit.

---

## Verification Contract

| Gate | Command | Covers |
|---|---|---|
| Type assertions | `pnpm --filter @systemfsoftware/effect-cell-types test:types` | U1, U2, U3, U4 |
| Composition tests | `pnpm --filter @systemfsoftware/effect-cell-types test` | U2, U3, U4 (AE1–AE5, AE7) |
| Package typecheck | `pnpm --filter @systemfsoftware/effect-cell-types typecheck` | U1–U4 (includes the compile sweep pinning `UnsharedTypeId`) |
| RuleTester suites | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow test` and `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` | U5, U6, U7 (AE8, AE9) |
| Consumer-package guards | `pnpm --filter <swept stryker-js/daemon package> test` and `typecheck` | U8 |
| Repo gate chain | `pnpm check:local` | all units, after the last edit |
| CI | `gh pr checks --watch --fail-fast` exits 0 | the delivery PR |
| Mutation | CI advisory Mutation workflow only; never local runs (REPO-D3) | U5, U6, U7 |

## Definition of Done

Global:

- Every acceptance example AE1–AE9 is evidenced by a passing test named in its unit.
- The three issues' acceptance criteria hold as rescoped by the Key Decisions; R14's migrations leave no mid-tree `Cell.run` in stryker-js.
- `pnpm check:local` exits 0 after the last edit; the delivery PR is watched to green.
- Every touched publishable package carries its changeset per R12.
- The spike directory `packages/effect-cell-types/spike/` is deleted before the package's first lint run; no abandoned-attempt code remains in the diff.
- Evaluator and doctrine surfaces moved in their own commits (U5's kernel widening, U7's EP1 re-pin, U9's CONCEPTS.md correction), each observed red before green where a gate exists.

Per-unit:

| Unit | Done when |
|---|---|
| U1 | `total` brands a total decision, refuses single-variant with the existing marker, and `make` is unchanged |
| U2 | `andThen` chains two workflows with an inferred refusal union and compiles into `Cell.layer`'s decide slot |
| U3 | A skipped gate provably never executes the inner cell |
| U4 | Both collect regimes run N items and fold per their contract, including the empty collection |
| U5 | All make-keyed rules recognize the new constructors; pre-existing suites unchanged and green |
| U6 | The reachability rule fails the costume fixture and passes every lawful fixture at `error` severity |
| U7 | The construction rule fails make-per-call and eager shapes, passes the lazy-memoized bootstrap and every arrow application, and is enrolled at `error` |
| U8 | The `Cell.run` alias is absent from the library surface; the eleven sites are arrow applications; every affected suite passes unchanged; tree-wide corpus probe reports zero findings |
| U9 | The `Description` entry names the rule's actual reach; own `docs:` commit |
```
