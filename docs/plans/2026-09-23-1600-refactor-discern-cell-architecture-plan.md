---
title: discern Cell-Architecture Conformance and Full oxlint Enrollment - Plan
type: refactor
date: 2026-09-23
topic: discern-cell-architecture
execution: code
---

# discern Cell-Architecture Conformance and Full oxlint Enrollment - Plan

## Objective

`packages/discern` passes `@systemfsoftware/oxlint-config-recommended` with zero findings, conforms to `compound-packs/cell-architecture/*.md` and `compound-packs/boundary-testing/*.md`, gives every module its cell role suffix, and keeps every upstream behaviour pinned at its correct test layer or retired with a stated reason.

Authority: `CONSTITUTION.md`, the two packs, the lint preset. `packages/discern/oxlint.config.ts` is `extends: [recommended]` and nothing else. No rule is relaxed, overridden, or suppressed.

Baseline: the upstream code as forked in #473 reports 690 findings (`no-explicit-any` 151, `consistent-type-assertions` 73, `no-unsafe-*` 183, `damp-test-naming` 48, `effecttsgo(async-function)` 44, `complexity` 36, `ban-unknown` 22, tag rules 37, others).

Reference behaviour is frozen at `/tmp/discern-reference/` (`src/index.ts`, `src/model.ts`, `src/procedure.ts`, `src/internal/hash.ts`, `tests/*.test.ts`, `test-types/surface.tst.ts`, `README.md`).

## Cell API (post-#478)

- `Workflow.make({ command, decision, error, decide })`. `command` is a `Schema.TaggedClass` carrying `static readonly [Workflow.InstrumentationBrand] = { <primitive field>: 'app.discern.<dotted.key>' } as const` (`{} as const` when no field is worth a span attribute). `decision` is a union of tagged classes sharing one family `TypeId`, or `Schema.Array(Schema.Union([...]))` for an event list. `error` is `Schema.Never` or `Schema.TaggedError` classes. `decide` returns `Result`.
- `Sandwich.named('<literal>')(read).decide(workflow).write(handlers)`. `read` returns the command's `Encoded` form and may intersect extras (`type XRead = (typeof Command)['Encoded'] & { readonly input: I }`, precedent `packages/effect-microsandbox/src/await-readiness.cell.ts`). Handlers are keyed by every encoded decision tag, every error tag, and `CommandRejected`; each receives `(encodedOutcome, readResult)`. A handler for a tag no outcome carries fails to compile.
- `Cell.provideContext(cell, context)` at the edge only.
- Reference: `packages/effect-cell-types/README.md`, `src/Workflow.ts`, `src/Sandwich.ts`, `src/Cell.ts`.

## Decisions

- **KD1 - The API may break; behaviour may not drift silently.** The package is unreleased, so `REPO-R1` makes the cleaner shape free. Every upstream scenario lands in the disposition table.
- **KD2 - Single namespace barrels.** `src/mod.ts` is `export * as Discern from './Discern/mod.js'`. `src/procedure.ts` is `export * as Procedure from './Procedure/mod.js'`. `Model` is nested: `src/Discern/mod.ts` contains `export * as Model from '../Model/mod.js'`. Barrels re-export from sibling leaf modules and contain nothing else. tsdown entries: `index: './src/mod.ts'`, `procedure: './src/procedure.ts'`.
- **KD3 - Data is Schema.** Tagged shapes are `Schema.TaggedClass`. Errors are `Schema.TaggedError` and carry `cause: Schema.optional(Schema.Defect)` when they wrap a failure. Dispatch is `Match.tag`/`Match.tags` plus `Match.exhaustive`, never `x._tag ===`. The recursive `PatternAst` is discriminated by `kind` and built with `Schema.suspend`.
- **KD4 - Illegal states are unrepresentable instead of thrown.** `ask`/`match` accept only schema-scoped nodes (`S extends Schema.Constraint`, no `undefined`). `Procedure.registry` takes a tuple of at least two members. `Eval.calibrate` takes a non-empty `values`. `registry.get` accepts only member ids. A reused decision id with a different definition, and duplicate procedure ids, stay runtime defects raised with `Schema.TaggedError` instances.
- **KD5 - Variants live with the workflow that constructs them.** `make-body-purity` reports any local import referenced inside a `Workflow.make` body, so every decision and error variant a workflow constructs is declared and exported from that workflow file. `*.schema.ts` holds data that no workflow constructs: commands, inspection records, stored observations, public errors raised by shells.
- **KD6 - The sandwich decisions.** Exactly these branch points are workflows, each deciding for one cell:

  | Workflow (`src/`)                       | Decides for                                         | Decision / error variants                                                                                                            |
  | --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
  | `select-case.workflow.ts`               | `run-policy.cell.ts`                                | `CaseSelected { caseId }`, `FallbackSelected`, `UncertainHandled { caseId, reason? }` / `UncertainUnhandled { caseId, reason? }`     |
  | `score-eval-record.workflow.ts`         | `measure-pattern.cell.ts`                           | `TruePositive`, `FalsePositive`, `TrueNegative`, `FalseNegative`, `Abstained` / `Schema.Never`                                       |
  | `select-route.workflow.ts`              | `invoke-procedure.cell.ts`                          | `RouteMatched { id, probability, margin, by, ranked }`, `RouteUncertain { reason, ranked }`, `RouteNone { reason }` / `Schema.Never` |
  | `admit-budget-charge.workflow.ts`       | `budget-provider.cell.ts`                           | `ChargeAdmitted { decisions }` / `BudgetExhausted { ... }`                                                                           |
  | `select-observation-source.workflow.ts` | `replay-provider.cell.ts`, `cache-provider.cell.ts` | `AllRecorded`, `AskForMissing { missing }` / `RecordingMissing { missing }`                                                          |

  Field lists are indicative; the owning slice finalises them against the reference behaviour.
- **KD7 - Pattern evaluation is resource code, not a workflow.** Judging an answer against a threshold, band, label, or range, and Kleene `and`/`or`/`not`, run inside the policy cell's `read` because they execute caller predicates and refinements. They are pure functions in `pattern.resource.ts` and `decision.resource.ts`, built from `Match` (complexity ≤ 2), returning the `PatternResult` classes of `Verdict.schema.ts`.
- **KD8 - Interceptors decorate the Provider seam.** `type Interceptor = (inner: Provider) => Provider`, because `DecisionModel.decide` is generic over the requested decisions and a partial merge of stored and fresh answers cannot be typed as `Decision.Answers<Decisions>` without a cast. `layer(source, interceptors)` is `DecisionModel.make` over the decorated provider. `intercept(interceptors)(layer)` decorates an existing `DecisionModel` through a cast-free provider view: `inner.decide(Decision.make({ input: Schema.Json, decisions }), { input: state })`. Stored observations hold the provider answer. An interceptor with a genuine outcome branch (replay, cache, budget) is a Sandwich cell built once per decorator instance, and the decorated provider's `decide` is `cell.run(options)`. Recording has no outcome branch: it keeps every answer the provider returned by filtering the answer record, so it is a plain provider decorator.
- **KD9 - Per-instance state stays inside the instance.** Stores and budgets are `*.handle.ts` records with a `TypeId`, holding `Ref` or `MutableRef`. No module-level registry, no `let` in `src/`, no mutable variable in `Effect.gen`.

## Role Suffixes

Every module under `packages/discern/src/` carries its role, per `compound-packs/cell-architecture/service-and-layer-boundaries.md` and the conformant packages (`effect-memfs`, `effect-readiness`, `effect-microsandbox`). The only unsuffixed files are `mod.ts` barrels, the `src/procedure.ts` entry barrel, and `src/schema-laws.test.ts`. A single-outcome helper lives inside its owning suffixed module.

| Suffix          | Role                                                               |
| --------------- | ------------------------------------------------------------------ |
| `*.schema.ts`   | data contract: schemas and tagged errors no workflow constructs    |
| `*.workflow.ts` | pure decision: one `Workflow.make` plus the variants it constructs |
| `*.resource.ts` | cold immutable definition or builder, with terminal projections    |
| `*.handle.ts`   | hot runtime instance: per-instance state, `TypeId`, `Pipeable`     |
| `*.cell.ts`     | imperative shell: one `Sandwich.named` chain                       |
| `*.service.ts`  | `Context.Service` / `Context.Reference` declarations               |

## Typing Protocol

| Problem                                           | Mechanism                                                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heterogeneous patterns and nodes                  | `Pattern<in Input>`, `DecisionNode<in Input, …>`; collections use `Pattern<never>` (variance annotations)                                                                   |
| A leaf's own `Answer<D>` out of the batch         | decode the batch entry through a per-node answer schema built at node construction; a missing or undecodable answer resolves the leaf to `Uncertain` naming the decision id |
| Handler returns a value or an Effect              | `isEffectOf = <A, E, R>(v: A \| Effect<A, E, R>): v is Effect<A, E, R> => Effect.isEffect(v)`, then lift                                                                    |
| Accumulating cases                                | a case stores `run: (input: I) => Effect.Effect<O, E, R>`; covariance widens per `when`                                                                                     |
| Existential upper bound in a covariant constraint | `type Top<A = unknown> = A`, only inside `extends` constraints (as in `packages/effect-cell-types/src/Workflow.ts`)                                                         |
| Unused conditional-type slots                     | `infer _`                                                                                                                                                                   |

No `as` except `as const`. No `any`. No non-null `!`. No `oxlint-disable`, `@ts-expect-error`, or `@ts-ignore` in `src/`. A slice that cannot express something with these mechanisms changes the API (KD1) or reports the concrete type error to Main. It never casts.

## Module Map and Ownership

| Slice                  | Wave | Owns (under `packages/discern/src/`)                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CoreData**           | 1    | `Verdict.schema.ts`, `PatternAst.schema.ts`, `Inspection.schema.ts`, `DiscernError.schema.ts`, `EvalReport.schema.ts`; `select-case` and `score-eval-record` workflows, each with `__tests__/<stem>.workflow.property.test.ts`                                                                                                                                                                          |
| **Model**              | 1    | `decision-model.resource.ts` (Provider, providers, layers, `Interceptor`, content addressing), `observation-store.handle.ts`, `budget.handle.ts`, `region.service.ts`, `replay-provider.cell.ts`, `cache-provider.cell.ts`, `budget-provider.cell.ts`, `Observation.schema.ts`, `Budget.schema.ts`, `admit-budget-charge` and `select-observation-source` workflows with property tests, `Model/mod.ts` |
| **CoreDsl**            | 2    | `decision.resource.ts`, `pattern.resource.ts`, `matcher.resource.ts`, `run-policy.cell.ts`, `measure-pattern.cell.ts`, `Discern/mod.ts`, `mod.ts`                                                                                                                                                                                                                                                       |
| **Procedure**          | 3    | `procedure.resource.ts`, `registry.resource.ts`, `invoke-procedure.cell.ts`, `procedure-depth.service.ts`, `Route.schema.ts`, `ProcedureError.schema.ts`, `select-route.workflow.ts` with its property test, `Procedure/mod.ts`, `procedure.ts`                                                                                                                                                         |
| **Suites**             | 4    | `tests/*.integration.test.ts`, `tests/*.refusal.test.ts`, `tests/__fixtures__/*`, `test-types/*.tst.ts`, the disposition table                                                                                                                                                                                                                                                                          |
| **Integration** (Main) | all  | `package.json`, `tsdown.config.ts`, `api-extractor*.json`, `tsconfig*.json`, `vitest.config.ts`, `src/schema-laws.test.ts`, `etc/*.api.md`, `AGENTS.md`, `README.md`, changeset; deletes `index.ts`, `model.ts`, `internal/`                                                                                                                                                                            |

## Cross-Slice Contracts

- **Model → CoreDsl, Procedure.** `decision-model.resource.ts` exports `type Hashable`, `hash(value: Hashable): string`, `decisionFingerprint(decision: Decision.Any): string` (`df_…`), `observationAddress(decision: Decision.Any, state: Schema.Json): string` (`o_…`), algorithms unchanged from `/tmp/discern-reference/src/internal/hash.ts`. `region.service.ts` exports `CurrentRegion` and `region(name)`. `Model/mod.ts` keeps the reference `model.ts` export names (`Interceptor` per KD8), plus the `Observations` schema so a JSON snapshot is decoded rather than cast. `isReplayMiss`/`isBudgetExceeded` keep recognising the failures the reference produced.
- **CoreData → CoreDsl.** `Verdict.schema.ts`: `PatternMatched` (`'Match'`), `PatternMissed` (`'Miss'`), `PatternUncertain` (`'Uncertain'`), each `{ reason: Schema.optional(Schema.String) }`, the `PatternResult` union and `type PatternStatus`. `Inspection.schema.ts`: `DecisionInspection`, `CaseInspection`, `CompiledPlan` (`version: 1`), `CaseTrace`, `Trace` (`version: 2`, `selected` tagged `'Case' | 'Fallback' | 'Uncertain'`). `DiscernError.schema.ts`: `UncertainMatchError { caseId, reason? }`, `ExhaustiveMatchError`, `DecisionIdCollisionError { decisionId }`. `EvalReport.schema.ts`: `EvalRecord`, `EvalMetrics`, `EvalReport`. Workflow exports are the camelCase of their stems.
- **Procedure owns routing data.** `Route.schema.ts`: `RouteCandidate { id, probability }`. `ProcedureError.schema.ts`: `DepthExceededError { depth, limit }`, `NoEligibleProcedureError { reason }`, `RoutingUncertainError { reason, ranked }`, `DuplicateProcedureIdError { id }`, `UnknownProcedureError { id, known }`. The public `Route` union is the encoded `select-route` decision, whose command carries the eligibility outcome the registry's `read` computes, so routing shape and eligibility semantics stay in one slice.
- **CoreDsl → Procedure.** The `Discern` namespace keeps the reference member names (`decision`, `classify`, `probability`, `rate`, `on`, `deterministic`, `predicate`, `structural`, `refine`, `refineResult`, `and`, `or`, `not`, `type`, `value`, `when`, `onUncertain`, `orElse`, `otherwise`, `compile`, `inspect`, `runWithTrace`, `ask`, `match`, `case`, `exhaustive`, `Eval`, `matched`, `missed`, `uncertain`). Procedure imports CoreDsl leaf modules directly, never a barrel.

## Test Layers

Admitted per `skill://test-layer-selection`. Nothing else is written. `*.resource.ts`, `*.handle.ts`, `*.cell.ts`, and `*.service.ts` modules get no tests of their own: resources, handles, and cells are covered through the composition specs, and services are declarations.

| Layer               | Location                                                                                                                                               | Admits                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema laws         | `src/schema-laws.test.ts`, generated by `@systemfsoftware/effect-schema-vite`                                                                          | every exported non-error schema                                                                                                                                                           |
| Refusals            | `tests/*.refusal.test.ts`                                                                                                                              | every refined schema's rejected inputs (`compound-packs/boundary-testing/refusals-beside-generated-laws.md`)                                                                              |
| Decision properties | `src/__tests__/<stem>.workflow.property.test.ts`, `it.effect.prop` or pure boolean `it.prop`                                                           | one named law per workflow outcome                                                                                                                                                        |
| Composition specs   | `tests/<story>.integration.test.ts`, gherkin via `@systemfsoftware/effect-gherkin-spec`, provider substituted at the `Model.provider` seam, in-process | cell behaviour only: batching and provider avoidance, trace, record/replay/cache/budget, region attribution, routing, projection, eligibility, depth, nesting, the runtime defects of KD4 |
| Type surface        | `test-types/*.tst.ts`                                                                                                                                  | inference pins and every type-level rejection                                                                                                                                             |

Wave 4 writes the disposition table first: each reference scenario mapped to exactly one of {decision property, composition spec, type assertion, retired with the reason}.

## Slice Definition of Done

1. `pnpm --filter @systemfsoftware/discern exec oxlint <owned files>` reports zero findings.
2. `pnpm --filter @systemfsoftware/discern exec tsc --noEmit` reports zero errors in owned files.
3. Owned tests pass: `pnpm --filter @systemfsoftware/discern exec vitest run <owned test files>`.
4. The report lists every shipped file with its suffix and every exported name.

## Package Gates (Main, after integration)

| Gate            | Command                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint            | `pnpm --filter @systemfsoftware/discern lint` exits 0 with the unrelaxed config                                                                |
| Types           | `pnpm --filter @systemfsoftware/discern typecheck` exits 0                                                                                     |
| Behaviour       | `pnpm --filter @systemfsoftware/discern test` exits 0 and the disposition table accounts for every reference scenario                          |
| Type surface    | `pnpm --filter @systemfsoftware/discern test:types` exits 0                                                                                    |
| Publish surface | `pnpm --filter @systemfsoftware/discern build` and `attw` exit 0                                                                               |
| Suffixes        | review: every file under `src/` outside `mod.ts`, `procedure.ts`, `schema-laws.test.ts`, and `__tests__/` ends in one of the six role suffixes |
| Repo            | `pnpm check:local` exits 0                                                                                                                     |

## Sequencing

1. **Wave 1 (parallel):** CoreData, Model.
2. **Wave 2:** CoreDsl, against the landed Wave 1 modules.
3. **Wave 3:** Procedure.
4. **Wave 4:** Suites; Main deletes the reference modules and integrates.
5. **Wave 5:** adversarial review (pack conformance, role suffixes, behaviour parity, type-surface fidelity, laundering and suppression audit); fix survivors.

## Review Record

Supersedes the unmerged `2026-09-23-0437` plan. That plan targeted the pre-#478 cell API (`Workflow.total`, explicit decode/encode phases) and assigned one verdict family to five judge workflows. `make-body-purity` makes the second impossible: a workflow may only construct variants it declares. KD5 through KD7 replace it.

Taste and substance: the project wiki has no discern-specific atom; `concepts/stateful-workflow-pathways.md` supports typed state carrying route decisions between deterministic steps. LiteLLM's record-and-replay keys cassettes on canonical request content (https://github.com/BerriAI/litellm/pull/37525), the same shape as discern's key-order-insensitive observation addresses.

Suffix calibration pair. Wrong: `src/pattern.ts`, `src/content-address.ts`, or verdict classes in `Verdict.schema.ts` constructed inside `combine-verdicts.workflow.ts`. Right: `src/pattern.resource.ts` constructing `Verdict.schema.ts` classes outside any `Workflow.make` body, with hashing inside `src/decision-model.resource.ts`.

### Destructive Review

Assumptions surfaced: (1) every discern branch point with I/O on both sides becomes one Sandwich cell whose `read` returns `Encoded` intersected with the live input and caller closures; (2) a store- or budget-backed interceptor can be both a `Provider` decorator and a Sandwich cell, the decorator's `decide` being `cell.run(options)` on a cell built once per decorator; (3) Wave 1 slices share no module.

Lens: **Substitution** (rotated from Edge-First, used by the 0437 review). Symptom: two competing structural patterns, the Provider decorator (KD8) and the Sandwich cell (KD6), both claim the interceptors.

Failures: (a) Module Map gave `select-route.workflow.ts`, `Route.schema.ts`, and `ProcedureError.schema.ts` to CoreData in Wave 1, while the command must carry the eligibility outcome (`by: 'elimination'` when one member survives) that only Procedure's `read` defines in Wave 3. (b) KD8 called recording "a plain provider decorator" while its reference body branches per decision on a missing answer, which left a branch outside any workflow unexplained. (c) Test Layers admitted `tests/*.refusal.test.ts`, which no slice owned.

Diverged draft: interceptors stop being cells. Each becomes a Provider decorator whose single branch calls a workflow as a plain function, with no Sandwich. Rejected: `compound-packs/cell-architecture/sandwich-phase-order.md` requires the chain for every outside interaction, and a replay miss, a cache hit, and a budget refusal are outside interactions with distinct outcomes.

Delta. Kept: KD1-KD9, suffix table, typing protocol, gates. Replaced: routing data and `select-route` moved from CoreData to Procedure (failure a). Added: KD8 now states recording keeps every answer the provider returned by filtering the answer record, not by branching per decision, and so has no outcome branch; the test-layer statement that resource, handle, cell, and service modules get no own tests. Removed: nothing.

Remediation: (a) Clear, resolved by the move. (b) Clear, resolved in KD8. (c) Clear, Suites own refusal tests.

Open doctrine conflict: `CONCEPTS.md` ("Flagged ambiguities", Cell vs Drifted key) states only `.workflow.ts` and `.schema.ts` remain as suffixes, while `compound-packs/cell-architecture/service-and-layer-boundaries.md` and the conformant packages use `*.cell.ts`, `*.service.ts`, `*.resource.ts`, `*.handle.ts`. This plan follows the packs and the conformant packages. No lint rule keys on these suffixes, so the gate is review.
