---
title: Trace Contract Packages - Plan
type: feat
date: 2026-09-22
topic: trace-taxonomy-spec
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
deepened: 2026-09-22
---

# Trace Contract Packages - Plan

## Goal Capsule

- **Objective:** The spans a behavior must produce are named once, and a rename or a new required attribute in that contract cannot pass without a compile or CI failure.
- **Means:** Three published packages — `effect-spec-runtime` (the registrar core extracted from `effect-gherkin-spec`), `trace-taxonomy` (Effect-only declarations), and `trace-spec` (observation and relations) — with the declaration itself as the emit site (KD1–KD3).
- **Product authority:** `packages/` and `examples/` are owned outright (`REPO-O1`); root `AGENTS.md` and `CONSTITUTION.md` govern; nothing under `repos/` changes (`REPO-S3`); `differential-spec` is not edited in this plan (KD7).
- **Execution profile:** Deep, phased (A runtime, B taxonomy + declarations, C spec + witness, D gates). Product Contract preservation: restructured, no scope change — R14, R17, R22, R23, R25 re-pointed to mechanisms settled in this session, R26 added for the runtime package.
- **Stop conditions:** `pnpm check:local` green with the witness Case included; every declaration discovered by the census is used; both lint rules red on their known-bad fixtures before the real check. Work delivered as a pull request watched to green (`REPO-D1`).
- **Open blockers:** None.

---

## Product Contract

### Summary

Add `@systemfsoftware/effect-spec-runtime`, `@systemfsoftware/trace-taxonomy`, and `@systemfsoftware/trace-spec`, and re-express `effect-gherkin-spec` on the runtime core without changing its public API. A contracted span is declared once with its name and typed required attributes and started only through that declaration, so the declaration is the only place a span name or a required attribute exists. `trace-spec` runs a behavior under a trace id it owns, observes the finished trace through an in-memory OpenTelemetry provider bridged from Effect's tracer, decodes it against the taxonomy, and holds relations over the resulting graph instead of Gherkin steps or HTTP status.

### Problem Frame

A `200` is not the observable output of a behavior in a system with queues, workers, and background consumers: the response can arrive before the work fails, and the failure lands in a later span inside a consumer no assertion is watching. Gherkin's own rule is that a `Then` asserts an observable output a stakeholder can recognize, and in a distributed system the completed trace is that output — which is why a trace contract needs a taxonomy rather than a Jaeger tab.

The raw material already exists here. `Sandwich.named` wraps a cell run in `Effect.withSpan` and emits `${name}.read` and `${name}.write` children, and daemon workers emit root spans carrying `daemon.name`. But the only way to read a span today is ad hoc inside a test body, as `Effect.currentSpan` is read in `packages/effect-daemon-spec/tests/poll-prereq-gate.integration.test.ts`. Nothing states which spans a behavior must produce, nothing notices when a span name changes, and nothing goes red when a contracted span stops being emitted. `differential-spec` already carries the assertion model this needs — a relation that must hold, with shrink, counterexample, and repro — over an output type that is not a trace graph.

### Key Decisions

- KD1. **The declaration is the emit site.** A contracted span is started only through its `Span.declare` value, so its name and attribute set exist once. (session-settled: user-directed — chosen over a hand-written taxonomy kept true by a lint rule: a lint cannot see a new required attribute in a struct, so only a typed start covers both a rename and an attribute addition.) Governs R1, R2, R4.
- KD2. **Packages split along the observation boundary.** Emitting code and adopters depend on `trace-taxonomy` alone; only `trace-spec` owns the observation SDK. (session-settled: user-directed — chosen over one package the emitting code would also depend on: a cell pulling an observation SDK is a packaging mistake.) Governs R5, R6, R26.
- KD3. **Two secondary guards, never the truth mechanism.** The emit-API literal ban and the dead-declaration check cover what the type system cannot reach; neither is what keeps the taxonomy honest — its force exists only because the declaration is the typed mechanism (per `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`). (session-settled: user-directed — chosen over promoting the lint to the primary mechanism: OpenTelemetry's API accepts any string name.) Governs R22, R23.
- KD4. **The taxonomy owns the edges and the forbidden spans.** Legal parent/child edges and forbidden spans live on the `Taxonomy` value so a spec cites them instead of restating them per case. Governs R3.
- KD5. **Observation is a local closure over a scoped provider.** The `Observe` port is declared in a pure module and provided by scoped layers (`ports-separate-from-layers`); a case obtains the closure from its suite's scenario layer, never from the system under test's requirements — `CELL-T4` satisfied without a second layer-to-scope mapping. Governs R9, R17.
- KD6. **The harness owns the OpenTelemetry SDK; nothing else does.** Amends the out-of-scope line and `KTD1` at `docs/plans/2026-09-21-1814-feat-cell-intrinsic-telemetry-plan.md:116,131`: those bind production packages and cells, which keep emitting `Effect.withSpan` and gain no OpenTelemetry dependency. Governs R5, R6.
- KD7. **`trace-spec` owns the failure vocabulary.** `TraceDisparityError` carries the relation, the breaks, and the trace id; decode failures stay `ContractDecodeError`. (session-settled: user-directed — chosen over reusing `differential-spec`'s `DisparityError{report: string}` and over generalizing it now: `outputA`/`outputB`/`reproSnippet` are a lie for one stimulus, one graph, and editing a published type pulls deferred work into this plan.) Governs R8, R13, R14.
- KD8. **In-memory observation first; the daemon path is the second witness.** The OTLP connector lands with `compare`; the fulfillment cell proves the contract, the daemon lifecycle comes after it is green. (session-settled: user-directed — chosen over the daemon path or a new checkout-shaped example: the fulfillment relation is the one that would fail if the implementation quietly charged on a hold.) Governs R6, R25.

### Requirements

**Taxonomy and emit (`trace-taxonomy`)**

- R1. `Span.declare({ id, name, attrs })` returns the single value naming a contracted span: `id` is the contract identity, `name` the emitted span name, and `attrs` an Effect `Schema` whose decoded type is the attribute set the span promises.
- R2. Starting a contracted span goes through its declaration and takes the declared attributes as a typed argument, so a missing or mistyped required attribute is a compile error at the call site.
- R3. `Taxonomy.make` composes declarations with the legal parent/child edges and the spans forbidden on a path.
- R4. Renaming a declared span's `id` or `name`, or adding a required attribute, breaks every emit site and every spec that referenced the value at compile time, with no human re-reading either.
- R5. `trace-taxonomy` carries no `@opentelemetry/*` dependency and no observation mechanism.

**Observation and decode (`trace-spec`)**

- R6. `trace-spec` observes a completed trace through an in-memory OpenTelemetry SDK provider — `SimpleSpanProcessor`, `AlwaysOn` sampling, explicit `forceFlush` — with Effect's tracer bridged to that provider, so spans emitted through `Effect.withSpan` in the code under test arrive as OpenTelemetry spans in one trace.
- R7. Observation yields a decoded graph indexed by taxonomy declaration, carrying per node its parent, status, `error.type`, duration, declared attributes, events, and links.
- R8. A span missing a required attribute decodes to a `ContractDecodeError` value distinct from a failed relation.
- R9. A spec receives observation as a local closure provided by the suite's per-scenario layer (`packages/effect-cell-types/AGENTS.md` CELL-T4).
- R10. Observing a trace id against which nothing was emitted fails, and that failure is distinguishable from a broken relation (pack: boundary-testing, real-system-oracles.md).
- R11. A failed relation leaves the observed graph where the failure is read, as a Vitest annotation naming a path under `artifacts/traces/`, including when the run is interrupted.

**Relations and the spec surface (`trace-spec`)**

- R12. Relations over the graph: `exists`, `absent`, `unique`, `forall`, `attrs`, `status`, `errorType`, `child`, `descendant`, `order`, `duration`, `event`, and `all`/`any`/`not`.
- R13. A relation answers with a hold or a `Break` naming the broken conjunct and the nodes it inspected; it never answers with a bare boolean.
- R14. `Rel.all` runs hard conjuncts before soft ones, stops on a hard break, and collects soft breaks into one report through its own `Break` collection; the existence of a contracted span is never a soft conjunct, and nothing here rides `effect-gherkin-spec`'s `SoftFailuresRef`.
- R15. A spec reads `contract(taxonomy).stimulate(stimulus).observe(observation).holds(relation)`, terminating in an explicit example input or a generated arbitrary that reuses `differential-spec`'s shrink supervisor.
- R16. A stimulus mints the trace id the spec will assert on and runs the behavior under it; no spec asserts against "the latest trace".
- R17. Vitest is the registrar only — `Suite(name).withLayer(...).withScenarioLayer(...).body(({ Case }) => …)` over the `effect-spec-runtime` registrar core — and no `Feature`, `Scenario`, or Given/When/Then keyword reaches a spec.
- R18. Outcomes a stakeholder reads aloud stay in `effect-gherkin-spec`; a behavior needing both a user-visible outcome and a trace relation gets two cases sharing one stimulus.

**Test layers**

- R19. Relations and decode are pure and carry property tests in files named for them; a table of hand-picked cases does not stand in for a law, and no test file sits beside a taxonomy declaration.
- R20. The observation path is exercised in-process against the real OpenTelemetry SDK in-memory exporter — never a mocked exporter or a fake tracer (pack: boundary-testing, no-mocks-on-internal-glue.md).
- R21. No case spawns a process; that altitude belongs to the OTLP connector and is deferred with it.

**Gates**

- R22. An oxlint rule at error severity refuses a raw span-name literal at an emit API — callee is `startSpan`, `spanBuilder`, or `startActiveSpan` and the first argument is a string or template literal — with no module exemption and no inline allow-list syntax; `Span.declare({ name: '…' })` is a declaration constructor and never matches, because the rule matches callee identity rather than string shape.
- R23. CI fails when a declared span is neither started by an emit site nor observed by a spec; declarations are enumerated by walking each package's `src/` for exported values of the declared-span type and resolved by binding — never by string, never by filename, and membership in a `Taxonomy.make` roster does not count as used.
- R24. Every touched publishable package publishes like its fullest sibling: generated exports from `tsdown.config.ts`, an api-extractor rollup built by the build script (not only CI), `attw`, and a changeset intent (`REPO-R2`).
- R25. The fulfillment cell is specified as a relation over its trace and runs inside `pnpm check:local`: `exists(FulfillmentSettle)`; on allocate, reservation-commit and credit-charge are children of `FulfillmentSettle` on the same trace; on hold or backorder, the credit-charge span is absent. The negative is carried as a known-bad fixture pair, not a standing expectation.
- R26. The suite registrar core — describe/it selection, suite and scenario layers, scope map, register mode, live-clock flag, task reference — lives in `effect-spec-runtime` parameterized by error and body type, `effect-gherkin-spec` keeps its public API on top of it, and no Gherkin name reaches `trace-spec`'s surface.

### Key Flows

- F1. Specifying and running a contract
  - **Trigger:** an engineer or agent wants a behavior held to its trace rather than to a response body.
  - **Actors:** the spec author; the code under test; the suite's per-scenario observation layer.
  - **Steps:** declare the span and compose the `Taxonomy`; write the spec as `contract().stimulate().observe().holds()` with an example or an arbitrary; the stimulus mints a trace id and runs the behavior; observation flushes, fetches that id, and decodes the graph; the relation is evaluated; a break reports the conjunct, the inspected nodes, and the graph.
  - **Outcome:** a green run means the contracted spans were emitted with their contracted attributes and ordering; a red run names which conjunct died.
  - **Covered by:** R6, R7, R12, R13, R15, R16, R17.
- F2. What a rename or an attribute addition does
  - **Trigger:** someone renames a span at the emit site, or adds an attribute to a declaration's `attrs`.
  - **Actors:** the emitting author; the compiler; the literal-ban rule; CI.
  - **Steps:** the declaration changes in one place; every start call and every spec that imported the value stops compiling; a raw literal introduced at an emit API is refused by the lint; a declaration nobody starts or observes fails the census; the witness spec stays red until the emitter is fixed.
  - **Outcome:** the failure arrives before anyone runs a suite against a live emitter.
  - **Covered by:** R4, R22, R23, R25.

### Acceptance Examples

- AE1. **Covers R2, R4.** Given a declaration whose `attrs` gained a required field, when a start call omits it, then typecheck fails — while a spec asserting only `exists` of that span still compiles.
- AE2. **Covers R8, R13.** Given a run whose contracted span omitted a required attribute, when the spec decodes and relates, then the result is a `ContractDecodeError` naming the attribute rather than a break of the relation.
- AE3. **Covers R10.** Given a trace id under which nothing was emitted, when the spec observes, then the case fails as an empty observation and no relation reports a hold.
- AE4. **Covers R14.** Given a spec whose hard conjuncts hold and whose soft invariant — every child span under a stated bound — does not, then the case reports that soft break together with every other soft break it evaluated.
- AE5. **Covers R25.** Given the known-bad fixture whose contracted span is never emitted, when the suite runs, then the relation breaks and names the missing span; the known-good fixture beside it passes.
- AE6. **Covers R26.** Given `effect-gherkin-spec` re-expressed on the runtime core, then its existing integration suites pass unmodified and no `FeatureBody` or `ScenarioBody` name appears in `trace-spec`'s public types.

### Success Criteria

- A reviewer who did not write the spec can name the broken conjunct and the span it inspected from the failure output alone (R13).
- The bridge choice is recorded with both alternatives evaluated (`REPO-W8`), so the dependency is a decision rather than a default.
- `pnpm check:local` is green with the witness Case included in the default run (R25).

<!-- ce-section: work-relationships -->

### How This Work Fits Together

This plan covers one body of work in four phases: the registrar core (A), the taxonomy and its first emit site (B), the spec harness and its witness (C), and the gates (D). The taxonomy precedes the spec; the gates land last so they are provable against real consumers. The broader design below is the current understanding, not a committed roadmap; later plans may revise, split, merge, or discard these areas.

- **Depends on this plan**
  - `compare` — two implementations held to one relation over their graphs, the `TraceGraph` equality tester it needs, and the `side` discriminator on `TraceDisparityError`.
  - `morph` — one system under a transformed stimulus, related to itself.
- **Enables nothing yet**
  - The OTLP connector, its wait-until-complete poll, and a second Vitest project that selects a connector per project rather than per case; the process-level test lane lands with it (R21).
  - Production-shaped synthetics built from the same specs, once the contract has stopped moving.
- **Second witness, after R25 is green**
  - The daemon prereq/restart path, whose ad-hoc `Effect.currentSpan` read becomes a contracted relation once the census can see it.
- **Still to decide**
  - Whether `effect-cell-types`' own cell span should _be_ a declaration rather than sit beneath one; that is a `CELL-T1`/`CELL-T2` surface change and is not active scope here.

### Scope Boundaries

**Deferred for later**

- `compare` and `morph`, the relation-over-two-graphs path, and the equality tester registered for graphs.
- OTLP/Tempo observation, the Vitest project that selects it, and the process-level lane it needs.
- Grading the taxonomy itself: asserting declared attributes against a schema of their own, and versioning a contract (`checkout@1`) beyond carrying an `id`.
- Making `Sandwich.named`'s cell span be a declaration, which would change `effect-cell-types` (`CELL-T1`, `CELL-T2`).

**Outside this product's identity**

- An English, Given/When/Then surface for trace contracts; `effect-gherkin-spec` keeps that role.
- A second oracle on one behavior — one observation per spec, always.
- Collection, sampling, or exporter plumbing for production telemetry; this package observes traces a test run finished.

**Deferred to Follow-Up Work**

- The daemon second witness (after R25 is green).
- Extracting a shared shrink/repro runtime from `differential-spec`, if `compare`/`morph` want it.

### Dependencies / Assumptions

- `differential-spec` supplies the shrink, counterexample, and repro supervisor the generated-input path reuses; it is consumed, never edited.
- The bridge is `@effect/opentelemetry@4.0.0-rc.116` with `@opentelemetry/sdk-trace-base@2.x`, both already resolved in the tree (`pnpm-lock.yaml:2411,3125`); its Effect-tracer source is read as ground truth at `repos/effect/packages/opentelemetry/src/OtelTracer.ts` (`REPO-W4`).
- Assumption: an in-memory provider plus an explicit flush needs no polling, so a poll on that path would hide a missing span end rather than absorb latency.
- Assumption: a contracted span started at the composition site parents a cell's own `Sandwich.named` span and its `.read`/`.write` children without changing `effect-cell-types` (`packages/effect-cell-types/src/Sandwich.ts:128,134,141`).

### Sources / Research

- Span emission today: `packages/effect-cell-types/src/Sandwich.ts:128,134,141`; daemon root spans and the existing span read at `packages/effect-daemon-spec/tests/poll-prereq-gate.integration.test.ts:24,29,36`.
- Cell rules this plan must not violate: `packages/effect-cell-types/AGENTS.md:9,10,12` (CELL-T1 surface, CELL-T2 type assertions, CELL-T4 local closure).
- The OpenTelemetry posture being amended: `docs/plans/2026-09-21-1814-feat-cell-intrinsic-telemetry-plan.md:116,131`.
- Reused assertion machinery: `packages/differential-spec/src/core/RelationalOracle.ts:9`, `DisparityError.schema.ts:3`, `DualExecutionSupervisor.ts`, `DisparityReporter.ts:17`; `docs/plans/2026-09-21-0659-feat-differential-harness-dsl-plan.md`.
- Registrar core to extract: `packages/effect-gherkin-spec/src/Feature.ts:155,176,192`, `FeatureRuntime.ts:18,23,24,368-377,371-377`, `DoNotation.ts:37,64,77-82`.
- The witness: `examples/inventory-fulfillment/src/fulfillment/fulfillment.cell.ts` (`Sandwich.named('fulfillment.settle')`, decisions `OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld`, `chargeFor` charges only on the two allocated tags); existing composition-altitude test at `examples/inventory-fulfillment/tests/inventory-fulfillment.integration.test.ts`.
- Gate conventions: `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/{behaviour-test-requires-gherkin,differential-test-requires-harness,test-suffix-outside-src,in-source-test-prop-only,tests-import-public-api}.ts`, `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/ban-data-taggederror{,.config}.ts` (defineRule + RuleTester shape), `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` (preset wiring).
- Discovery precedent: `packages/effect-schema-discovery/src/mod.ts:35` (`findExportedSchemas` walks a directory for exported consts by type annotation), consumed by `packages/effect-schema-vite/src/mod.ts:56`.
- Property-test conventions: `packages/effect-daemon-spec/src/internal/__tests__/choose-restart-strategy.workflow.property.test.ts` (Unicode law names, Schema-as-arbitrary via `it.prop`), `packages/effect-schema-law/README.md` (ruleOfSchemas pair).
- Doctrine this plan answers to: `CONCEPTS.md` — `Costume`, `Reach`, `Known-bad fixture`, `Independent oracle`, `Drift gate`, `Verification observer`, `Evaluator surface`, `Contract lane`; `CONCEPTS.md:12-16` (api-extractor needs `tsconfig.api.json` with `customConditions: []`).
- Learnings applied: `docs/solutions/build-errors/exports-types-rollup-drift.md` (rollup inside `build`, `attw --pack` against a clean dist, rollup and barrel are distinct artifacts); `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` (error, never warn — no lint script passes `--deny-warnings`); `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md`; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`; `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`.
- Pack findings applied: `compound-packs/boundary-testing/no-mocks-on-internal-glue.md`, `compound-packs/boundary-testing/pin-dependency-semantics.md`, `compound-packs/boundary-testing/real-system-oracles.md`, `compound-packs/cell-architecture/handle-state-privacy.md` (module mutable registries forbidden — rules out self-registering declarations).
- Prior art: the OpenTelemetry Demo `tracetesting` suite (trigger, own the trace id, wait, assert span attributes; `app.currency.conversion.from/to` on a named span) and Tracetest as its harness; Drozd, "Span Contracts: Trace-Driven API Contract Testing with OpenTelemetry" (a response-shape hash from span attributes, not a declaration the emitter must start through). No prior art for trace-based testing exists in this repo.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Bridge over owned adapter.** Depend on `@effect/opentelemetry@4.0.0-rc.116` + `@opentelemetry/sdk-trace-base@2.x` (new catalog entries, `catalogMode: prefer`); provide the in-memory provider through its `OtelTracerProvider` service and `Resource`, then `OtelTracer.layer` installs the Effect tracer (`repos/effect/packages/opentelemetry/src/OtelTracer.ts`). Alternatives recorded (`REPO-W8`): an owned Effect-to-OTel adapter rejected — it re-implements the vendored `OtelSpan` (attributes, events, links, status, context activation) and drifts from upstream; observing via `Effect.currentSpan` alone rejected — no finished-span store, no exporter, no cross-service assembly. Bridge lifecycle semantics pinned by an executable contract test so an upstream bump trips before consumers regress (pack: boundary-testing, pin-dependency-semantics.md). Governs R6, U5.
- KTD2. **The registrar core is extracted, parameterized, and shared.** `effect-spec-runtime` owns describe/`it.effect`/`it.live` selection, `withLayer`/`withScenarioLayer`/`withScope`, layer options, register mode, and the Vitest task reference, with the error type and body type as parameters. `effect-gherkin-spec` re-expresses `Feature` on it with its public API unchanged; `trace-spec` grows `Suite`/`Case` on it. Extraction proof: gherkin's existing integration suites pass unmodified (AE6). (session-settled: user-directed — chosen over depending-and-aliasing, whose `ScenarioBody<R> = Effect<Top, StepError, R>` error channel would forge a fake `keyword` onto every trace failure, and over forking, which duplicates the one Layer-to-scope mapping and re-creates the two-exporters-or-none hazard.) Governs R17, R26, U1.
- KTD3. **The literal ban matches callee identity, not string shape or file identity.** Forbid a call whose callee is `startSpan`/`spanBuilder`/`startActiveSpan` with a string or expression-free template as first argument; `Span.declare` never matches. No module key and no allow-list syntax: the exemption clause would require a selector nobody re-derives, which is the drifted-key failure; a genuine vendor exception lives as one reviewed known-good fixture, not a stampable syntax. (session-settled: user-directed — chosen over keying the exemption on module identity, whose rename silently un-enrols files from the rule.) Governs R22, U7.
- KTD4. **The census walks `src/` by exported type and resolves by binding.** Reuse the `effect-schema-discovery` walk shape against the declared-span type; a declaration counts as used only through a `.start(` call site or a spec site that resolves to that binding; `Taxonomy.make` membership is not used. Entry is `src/`, never `dist/`; match type, never filename. (session-settled: user-directed — chosen over a per-package taxonomy registry, which is a roster of the roster a dead declaration can hide outside, and over self-registration, which `compound-packs/cell-architecture/handle-state-privacy.md` forbids outright.) Governs R23, U8.
- KTD5. **`TraceDisparityError` is `trace-spec`'s and only its failure type.** `{relationId, breaks, traceId, dumpPath?}` with `breaks` carrying the conjunct and inspected node ids `Rel` already produced; `ContractDecodeError` stays separate so a broken emitter never reads as a failed behavior. `compare`/`morph` must fail with it (a `side: 'a' | 'b' | 'iso'` discriminator when two graphs exist). The rendering _discipline_ (null-guarded stringify, cause rendering) is reused; `formatDisparity`'s dual-run template is not — it reads a `DisparityRecord` shape `Rel` does not produce. Governs R8, R11, R13, U4.
- KTD6. **Trace specs are named and gated like their siblings.** `*.trace.test.ts` admitted by `test-suffix-outside-src` in the same commit as `trace-test-requires-taxonomy`, which requires the spec harness imports by binding, forbids raw emit-API use in a trace spec, and forbids a Case that terminates on an HTTP status or body assertion; error severity, RuleTester valid/invalid pair, wired through `@systemfsoftware/oxlint-config-recommended`. (session-settled: user-directed — chosen over conventional imports with no suffix rule: nothing would then stop a trace file from terminating on `expect(res.status).toBe(200)`, the exact failure the DSL exists to make illegal.) Governs R25, U9.
- KTD7. **Evaluator surfaces own their commits.** The two lint rules and the census are Evaluator surfaces: each lands in its own commit with the gate observed red on its known-bad fixture and green after, never in the commit of the work it judges (`CONCEPTS.md` — Evaluator surface). Governs R22, R23, U7, U8, U9.
- KTD8. **Packaging target is the fullest sibling.** Each new package carries the `effect-gherkin-spec` shape: generated exports with the `@systemfsoftware/source` condition, `api-extractor.json` + `tsconfig.api.json` with `customConditions: []`, api-extractor rollup produced inside `build` (per `docs/solutions/build-errors/exports-types-rollup-drift.md`), `attw`, `test:types` via tstyche, and a changeset intent; the gherkin re-expression ships as a `none` bump (internal-only, `REPO-R2`). Governs R24, U1, U2, U4, U5.
- KTD9. **Property laws over example tables.** `Rel` and decode carry `*.property.test.ts` laws with Unicode-named invariants and Schema-derived arbitraries via `it.prop`, colocated under `src/__tests__/`; behavior-lane integration tests run the real in-memory exporter; `Test expectation: none` only for packaging-only units. Governs R19, R20, U2, U4, U5.

### High-Level Technical Design

```mermaid
flowchart TB
  subgraph emitting["Emitting code — no OpenTelemetry"]
    cell["examples/inventory-fulfillment<br/>fulfillment.settle cell"]
    decl["trace-taxonomy<br/>Span.declare · start · Taxonomy"]
    cell -->|declares + starts| decl
  end
  subgraph registrar["effect-spec-runtime (extracted)"]
    core["describe/it · withLayer · withScenarioLayer<br/>scope map · mode · task ref"]
  end
  subgraph harness["Observation harness (trace-spec)"]
    suite["Suite · Case"]
    bridge["@effect/opentelemetry + sdk-trace-base<br/>in-memory provider"]
    graph["Graph decode · ContractDecodeError"]
    rel["Rel · TraceDisparityError"]
    suite --> core
    suite --> graph
    graph --> rel
    suite -->|stimulate + observe| bridge
  end
  subgraph gates["Gates (Evaluator surfaces, own commits)"]
    lint1["ban-raw-span-name-emit"]
    lint2["trace-test-requires-taxonomy"]
    census["declared-span usage census"]
  end
  decl -->|same declaration value| suite
  bridge -.->|finished spans of the owned trace id| graph
  lint1 -.-> emitting
  lint2 -.-> suite
  census -.-> decl
```

Dependency direction: `trace-spec → trace-taxonomy → effect`; `trace-spec → effect-spec-runtime`; `trace-spec → differential-spec` (supervisor, consumed not edited); `effect-gherkin-spec → effect-spec-runtime`. No edge reaches from a cell package to any OpenTelemetry package (R5, KD6).

### System-Wide Impact

Mapped from a blast-radius pass over the workspace; each claim is verified at the cited line.

- **The gherkin re-expression has exactly two consumer shapes and zero deep-path importers.** `effect-daemon-spec` imports `it, layer` for in-source property tests, and `differential-spec`'s integration tests import the Gherkin combinators plus `makeFeature` (`packages/differential-spec/tests/supervisor.integration.test.ts:2`); no file anywhere imports `@systemfsoftware/effect-gherkin-spec/src/…` by deep path, so moving `FeatureRuntime`/`DoNotation` internals cannot break a consumer that bypasses the barrel. The exposure is type-level: `mod.ts:1-53` re-exports `FeatureBody`, `ScenarioBody`, `ScenarioCallable`, `ScenarioOptions`, `RegisterMode` by name, and U1's verification gate is therefore type identity, not just runtime behavior — a renamed type alias breaks consumers even when behavior is preserved.
- **The preset spreads new rules to thirteen packages on the day they land.** `packages/oxlint-presets/oxlint-config-recommended/src/index.ts:24` wires `test-discipline`'s recommended rules directly, and that preset is extended by twelve packages (atom ×2, differential-spec, effect-cell-types, effect-daemon-spec, effect-gherkin-spec, effect-memfs, effect-microsandbox, effect-readiness, npm-package, rx-effect, storybook-gherkin). Both new rules at error severity are therefore repo-wide the moment they are wired — which is intended — and day-one cleanliness is verified: no `startSpan(`/`spanBuilder(`/`startActiveSpan(` call with a string literal exists in any `src/` today, and no `*.trace.test.ts` file exists, so neither rule flips an existing file red.
- **The suffix admission is a two-entry list becoming three.** `test-suffix-outside-src` passes exactly `.integration.test.ts` and `.differential.test.ts` (`path.config.ts:22-23`) and reports everything else at error; admitting `trace.test.ts` is a net-new third entry, uncontested on day one, and lands in the same commit as its rule per KTD6.
- **The census must not be a cached turbo task.** `pnpm check:local` is a root shell chain (`package.json:21`: dprint check → `gate:tasks` → `gate:dist`); a census declared as a turbo task whose inputs are `packages/*/src/**` would key on sources it does not rewrite, but a guard that only fails on findings would cache its green verdict exactly like a `Stale pass` — the check that never looked. U8 wires the census as a root guard script in the gate chain (the `check-exported-wiring` precedent), not as a turbo task. Adding rules to the preset correctly busts the lint cache, because `turbo.json` keys the lint task on `oxlint.config.ts`.
- **The dependency edges this plan adds are all first-of-kind, not cyclic.** `differential-spec` currently has zero workspace consumers, so `trace-spec → differential-spec` creates the first edge into it rather than a second path; `effect-cell-types` is consumed by four packages today, of which the inventory example is the one gaining `trace-taxonomy`; and no package imports OpenTelemetry in `src/` today, so R5 and KD6 start true rather than requiring a migration.

### Risks & Dependencies

- The bridge is pinned to the effect rc line; an upstream rc bump must move `@effect/opentelemetry` in the same change — the pin contract test (KTD1) is the tripwire.
- `effect-gherkin-spec`'s re-expression is behavior-preserving by its existing integration suites; a divergence there stops the phase rather than being patched around.
- The census and both rules are pattern-selected, not type-enforced; their reach is the fixtures' reach, and each fixture pair is the proof the rule selects at all.
- `@opentelemetry/sdk-trace-base@2.11.0` and `@effect/opentelemetry@4.0.0-rc.116` are `minimumReleaseAge: 1440`-gated; already resolved transitively, so no registry surprise is expected.
- Flush semantics: the in-memory exporter resolves outside Effect's TestClock; observation suites run on the runtime's live-clock path, and a TestClock run awaiting flush is a hang, not a slow test.

---

## Implementation Units

### U1. Extract `effect-spec-runtime` and re-express gherkin on it

- **Goal:** one registrar core, two consumers, no Gherkin name below `effect-gherkin-spec`.
- **Requirements:** R17, R26. **Dependencies:** none.
- **Files:** `packages/effect-spec-runtime/` (new: `package.json`, `tsdown.config.ts`, `oxlint.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `api-extractor.json`, `tsconfig.api.json`, `src/mod.ts`, registrar modules, `tests/`, `test-types/`), `packages/effect-gherkin-spec/src/Feature.ts`, `packages/effect-gherkin-spec/src/FeatureRuntime.ts`, `packages/effect-gherkin-spec/src/DoNotation.ts` (task reference moves), `packages/effect-gherkin-spec/src/mod.ts`, `.changeset/` intent.
- **Approach:**
  1. Move describe/`it.effect`/`it.live` selection, suite/scenario layer composition, scope map, register mode, live-clock flag, and the Vitest task reference into the runtime, with error and body types as parameters.
  2. Rebuild `Feature`/`FeatureRuntime` on the runtime with identical public types; Gherkin stages, `StepError`, `SoftFailuresRef`, and `pollSchedule` stay put.
  3. Package per KTD8; gherkin changeset at `none`.
- **Patterns to follow:** `packages/effect-gherkin-spec/src/Feature.ts:109-180` (builder shape), `FeatureRuntime.ts:18-24,443-500`; scaffolding mirrors `packages/effect-gherkin-spec/package.json`, `tsdown.config.ts:1-27`.
- **Test scenarios:**
  - Existing `packages/effect-gherkin-spec/tests/*.integration.test.ts` pass unmodified (behavior preservation — this is the extraction proof).
  - Runtime: a suite with only a shared layer registers one worker-scoped acquire/release per suite.
  - Runtime: a suite with a scenario layer acquires and finalizes per case, including on a failing case.
  - Runtime: `skip`/`only` register modes and the live-clock flag select the Vitest family expected.
  - Runtime: the task reference is provided to a case body and absent outside a registered case.
  - Type assertions in `test-types/*.tst.ts`: the error and body type parameters flow through the builder without widening.
- **Verification:** `pnpm --filter @systemfsoftware/effect-gherkin-spec test` green unmodified; runtime package's own suites green; `pnpm --filter @systemfsoftware/effect-spec-runtime attw` green.

### U2. Build `trace-taxonomy`

- **Goal:** declarations exist, are typed, and compose; nothing here observes anything.
- **Requirements:** R1, R2, R3, R4, R5, R19. **Dependencies:** none.
- **Files:** `packages/trace-taxonomy/` (new: full package per KTD8, `src/mod.ts`, declaration/composition modules, `src/__tests__/*.property.test.ts`, `test-types/*.tst.ts`), `.changeset/` intent.
- **Approach:**
  1. `Span.declare({ id, name, attrs })` produces the declared value carrying a Schema-decoded attribute set and a typed `start` that wraps `Effect.withSpan` with exactly the declared name and attributes.
  2. `Taxonomy.make` composes declarations with parent/child edges and forbidden spans; membership carries no emit authority.
  3. Property laws via the schema's own arbitrary; type assertions prove the compile-error arms of R2/R4.
- **Patterns to follow:** `packages/differential-spec/src/core/DisparityError.schema.ts` (Schema.TaggedError), `packages/effect-cell-types/tests/__fixtures__/accept-tagged-command.workflow.ts` (pure-module shape), `packages/effect-daemon-spec/src/internal/__tests__/choose-restart-strategy.workflow.property.test.ts` (law naming, Schema-as-arbitrary).
- **Test scenarios:**
  - Property: a declared span started with valid attributes emits one span with exactly the declared name and attributes (`∀` over generated valid inputs).
  - Property: attribute decode round-trips through the declared Schema (ruleOfSchemas pair via the schema-vite law suite).
  - Type assertion: omitting a required attribute at `start` fails to compile; a mistyped one fails to compile; a spec referencing a renamed declaration fails to compile (`tstyche` `@ts-expect-error` arms).
  - Taxonomy: edges and forbidden spans are carried on the composed value and are readable by a relation consumer.
  - The package's dependency manifest names no `@opentelemetry/*` entry.
- **Verification:** `pnpm --filter @systemfsoftware/trace-taxonomy typecheck test test:types api:check attw lint` green.

### U3. Declare the fulfillment spans and start the contracted one

- **Goal:** the witness behavior emits a contracted parent span through a declaration.
- **Requirements:** R1, R2, R25. **Dependencies:** U1 not required; U2 required.
- **Files:** `examples/inventory-fulfillment/src/fulfillment/fulfillment-settle.span.ts` (declarations beside the cell — filename carries no authority), `examples/inventory-fulfillment/src/fulfillment/fulfillment.cell.ts` (start the contracted span around the run), `examples/inventory-fulfillment/package.json` (+ `trace-taxonomy` dep), `.changeset/` intent if the example's build hash moves.
- **Approach:**
  1. Declare `FulfillmentSettle`, `ReservationCommit`, `CreditCharge` with the attributes the relations will assert.
  2. Start `FulfillmentSettle` around `fulfillmentCell.run` at the composition site, so the cell's own `fulfillment.settle` span and its `.read`/`.write` children land beneath it.
- **Patterns to follow:** `examples/inventory-fulfillment/src/fulfillment/fulfillment.cell.ts:2-3,231-238` (the cell and its composition); `packages/effect-cell-types/src/Sandwich.ts:128,134,141` (the span shape beneath).
- **Test scenarios:**
  - Type assertion: starting `FulfillmentSettle` without the declared attributes fails to compile.
  - The example's existing integration suite stays green — the wrapping span changes no behavior.
- **Verification:** example typecheck and existing integration test green; the span-parenting claim itself is proven by U6's harness, not here — U3 proves only that the wrapping changes no behavior.

### U4. Build `trace-spec` core: graph, relations, failure

- **Goal:** decode a trace against the taxonomy and answer relations with holds and breaks.
- **Requirements:** R7, R8, R11, R12, R13, R14, R19. **Dependencies:** U2.
- **Files:** `packages/trace-spec/` (new: full package per KTD8; `src/` graph decode, `Rel` module, `TraceDisparityError` + `ContractDecodeError` schemas, failure dump module; `src/__tests__/*.property.test.ts`), `.changeset/` intent.
- **Approach:**
  1. Decode a span list into a graph indexed by declaration, per node parent/status/`error.type`/duration/attributes/events/links; a missing required attribute is `ContractDecodeError`, never a failed relation.
  2. `Rel` combinators answer `Hold | Break` with the conjunct and inspected node ids; `Rel.all` evaluates hard before soft and collects soft breaks into one report.
  3. `TraceDisparityError` per KTD5; on failure the graph is dumped and its path recorded for the Vitest annotation.
- **Patterns to follow:** `packages/differential-spec/src/core/DualExecutionSupervisor.ts` (break rendering discipline), `DisparityReporter.ts:17` (string renderer — reused, not its schema).
- **Test scenarios:**
  - Property: `exists` holds iff at least one decoded node of the declaration is present (`∀` graphs); `absent` is its negation; `unique` holds iff exactly one.
  - Property: `child`/`descendant` hold exactly when the parent edge (or the link-walk) reaches the target from the named parent.
  - Property: `Rel.all` stops on the first hard break and reports every soft break evaluated; a hard `exists` is never soft (AE4).
  - Property: decode never invents an attribute — a node's decoded attrs are exactly the declared keys present, and a missing one is a `ContractDecodeError` naming it (AE2).
  - Integration: a failed relation writes the graph dump and records its path (R11).
  - Type assertion: a relation never answers a bare boolean; `TraceDisparityError` carries no `keyword`/`text`.
- **Verification:** property + integration suites green; `api:check`/`attw` green.

### U5. Build `trace-spec` harness: stimulus, observe, DSL, suite

- **Goal:** one stimulus, one owned trace id, one observation, one relation — registered through the runtime.
- **Requirements:** R6, R9, R10, R15, R16, R17, R20. **Dependencies:** U1, U2, U4.
- **Files:** `packages/trace-spec/src/` (observe/stimulus/DSL/suite modules), `packages/trace-spec/package.json` (+ `@effect/opentelemetry`, `@opentelemetry/sdk-trace-base` via catalog; peer `effect`, dev `@effect/vitest`), `pnpm-workspace.yaml` catalog entries, `packages/trace-spec/tests/*.integration.test.ts` (real in-memory exporter), bridge pin contract test, `.changeset/` intent.
- **Approach:**
  1. Stimulus mints a trace id, injects W3C `traceparent`, runs the behavior, and returns the id with the output (R16).
  2. Observe provides the in-memory provider (`SimpleSpanProcessor`, `AlwaysOn`) through the `@effect/opentelemetry` tracer layer as a scoped scenario-layer resource; the case obtains the closure from its scenario layer (R9); flush then decode (R6); an empty trace for the owned id fails as its own outcome (R10). Observation cases run on the live clock — flush and exporter resolution happen outside any TestClock boundary (per `docs/solutions/runtime-errors/layered-liveclock-cannot-use-testclock-withlive.md`).
  3. `contract(t).stimulate(s).observe(o).holds(r)` ends in an example input or an arbitrary over `differential-spec`'s existing shrink supervisor — it is in the tree today and needs none of the deferred `compare`/`morph` machinery. `Suite`/`Case` register through the runtime core with trace-spec's own error channel. The new catalog entries for the two OpenTelemetry packages are the upgrade-safety gate; the pin contract test is the runtime tripwire.
- **Patterns to follow:** `repos/effect/packages/opentelemetry/src/OtelTracer.ts` (provider service + layer install); `packages/effect-gherkin-spec/src/Feature.ts:155,176` (layer wiring via the runtime).
- **Test scenarios:**
  - Integration: a real `Effect.withSpan` behavior observed through the in-memory provider yields a decoded graph whose nodes are OpenTelemetry spans of one trace id (AE3's complement).
  - Integration: observing an id with no spans fails as an empty observation, distinguishable from a break (AE3).
  - Integration: a contracted span started around a cell run parents the cell's `.read`/`.write` spans (assumption 2 of the drill, proven not assumed).
  - Integration: a generated-input spec shrinks to a smallest counterexample whose graph breaks the relation, reported through `TraceDisparityError`.
  - Bridge pin: the provider service, resource, and layer install resolve at the pinned versions; the pin contract test fails if the install shape moves (pack: boundary-testing, pin-dependency-semantics.md).
  - Integration: two specs in one process each own their trace id; neither observes the other's spans (no dual oracle).
  - Integration: an observation case registered through the runtime's live-clock path completes its flush under that clock rather than hanging on a TestClock boundary.
- **Verification:** suites green against the real exporter; `attw` green; the dependency manifest carries no `@opentelemetry/*` outside the harness package.

### U6. The fulfillment witness spec

- **Goal:** the business relation that would fail if a hold quietly charged.
- **Requirements:** R25, R16, R17, R22's spec-side. **Dependencies:** U3, U5.
- **Files:** `examples/inventory-fulfillment/tests/fulfillment.settle.trace.test.ts`, `examples/inventory-fulfillment/tests/__fixtures__/` (known-bad: a Case whose `CreditCharge` declaration is never emitted, known-good: the real wiring), `examples/inventory-fulfillment/package.json` (+ `trace-spec` dep).
- **Approach:**
  1. `Suite('fulfillment.settle').withScenarioLayer(observe.inMemory()).body(({ Case }) => …)` with the three relations over allocate / hold / backorder.
  2. Composition-altitude evidence stays in `tests/inventory-fulfillment.integration.test.ts`, untouched.
- **Patterns to follow:** `docs/plans/2026-09-21-0659-feat-differential-harness-dsl-plan.md` (case idioms); `examples/inventory-fulfillment/tests/inventory-fulfillment.integration.test.ts` (fixture discipline).
- **Test scenarios:**
  - Allocate path: `exists(FulfillmentSettle)`, `child(FulfillmentSettle, ReservationCommit)`, `child(FulfillmentSettle, CreditCharge)` on one trace.
  - Hold and backorder paths: `exists(FulfillmentSettle)` and `absent(CreditCharge)` on the same trace.
  - Known-bad fixture: the never-emitted `CreditCharge` Case breaks and names the missing span; the known-good fixture passes (AE5).
- **Verification:** the spec is in the default run (`pnpm check:local`) and green; removing the `FulfillmentSettle.start` call turns it red, restoring it green.

### U7. The emit-API literal ban

- **Goal:** a raw span name cannot enter through an emit API in any file.
- **Requirements:** R22 (its no-exemption clause, per KD3 and KTD3). **Dependencies:** none (rule); fixtures reference U2's declare shape.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/ban-raw-span-name-emit.ts` + `.config.ts` + `__tests__/ban-raw-span-name-emit.test.ts`, `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` (wiring). **Own commit** (KTD7).
- **Approach:** `defineRule` matching callee ∈ {`startSpan`, `spanBuilder`, `startActiveSpan`} with a string or expression-free template first argument; `Span.declare` never matches; error severity.
- **Patterns to follow:** `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/ban-data-taggederror{,.config}.ts`, `RuleTester` valid/invalid arrays.
- **Test scenarios:**
  - Invalid: `tracer.startSpan('checkout.place_order')`, `spanBuilder('x')`, `startActiveSpan(\`template ${'\${x}'}-free\`)`.
  - Valid: `Span.declare({ name: 'checkout.place_order' })`; `PlaceOrder.start(ctx, attrs)`; a template with expressions at an emit API is still invalid (rule matches the callee, not the shape).
  - Severity is error: the preset wiring reports it as a failure, not a warning.
- **Verification:** the known-bad fixture is red under the rule and the known-good pair produces zero findings, observed before the wiring lands (`Evaluator surface`).

### U8. The declared-span usage census

- **Goal:** a declared span nobody starts or observes fails CI.
- **Requirements:** R23. **Dependencies:** U2 (the type), U3 (a real used declaration to stay green).
- **Files:** `scripts/guards/check-declared-span-usage.ts` (walk `packages/*/src/**` and `examples/*/src/**` for exported declared-span values, resolve uses by binding), fixtures (`known-bad`: `export const Orphan = Span.declare({…})` with no start and no spec; `known-good`: the same const started or `Rel.exists(Orphan)`), the root verification chain wiring in `package.json`'s `check:local` gate sequence (the `check-exported-wiring` guard precedent). **Own commit** (KTD7).
- **Approach:** discovery mirrors `packages/effect-schema-discovery/src/mod.ts:35` (directory in, exported consts by type annotation out); a use is a `.start(` callee or a spec-site reference resolving to the binding; string matches do not count; `Taxonomy.make` membership does not count; entry is `src/`, never `dist/`. The census runs as a root guard in the gate chain, never as a turbo task whose inputs are `packages/*/src/**` — a green verdict that caches is a `Stale pass` waiting to happen (see System-Wide Impact). The walk's predicate matches the declared-span type annotation; `effect-schema-discovery`'s own predicate is Schema-specific and does not transfer as-is.
- **Patterns to follow:** existing root guards under `scripts/guards/` and their fixture discipline.
- **Test scenarios:**
  - Known-bad: an unused declaration fails the census with its binding named.
  - Known-good: a started declaration and a spec-observed declaration each pass.
  - A declaration referenced only inside `Taxonomy.make` fails.
  - A comment or log line containing the span name does not satisfy a use.
- **Verification:** the census is red on the fixture and green on the tree; wired into the local verification chain so `pnpm check:local` runs it.

### U9. Trace spec naming and its companion rule

- **Goal:** a file claiming to be a trace spec cannot quietly assert HTTP status.
- **Requirements:** R25's naming, R22's spec-side, R17. **Dependencies:** U5, U6 (the fixtures import the harness).
- **Files:** `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/trace-test-requires-taxonomy.ts` + `.config.ts` + `__tests__/`, `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/test-suffix-outside-src.ts` and `path.config.ts` (the suffix constants live there — admit `trace.test.ts`, same commit), preset wiring. **Own commit** (KTD7).
- **Approach:** basename matches `*.trace.test.ts` → must import `Span`/`Rel`/`Suite` from the harness by binding; must not call a raw emit API; must not terminate a Case on an HTTP status or body assertion; error severity.
- **Patterns to follow:** `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/{behaviour-test-requires-gherkin,differential-test-requires-harness,test-suffix-outside-src}.ts`.
- **Test scenarios:**
  - Valid: the fulfillment witness file (harness imports, relation terminations).
  - Invalid: a `*.trace.test.ts` importing the harness then terminating on `expect(res.status).toBe(200)`; a `*.trace.test.ts` with no harness import; a `*.trace.test.ts` calling `tracer.startSpan`.
  - `*.integration.test.ts` files keep HTTP assertions without tripping the rule (composition altitude stays legal elsewhere).
- **Verification:** RuleTester pair red/green; `test-suffix-outside-src` admits the suffix in the same commit; the rule is red on its known-bad fixture before wiring.

---

## Verification Contract

| Check             | Command                                                                    | Proves                                |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Local chain       | `pnpm check:local`                                                         | Everything below, in the repo's order |
| Per-package suite | `pnpm --filter <pkg> test`                                                 | U1, U2, U4, U5, U6 behaviors          |
| Property laws     | `pnpm --filter @systemfsoftware/trace-spec test` (property files included) | R12–R14, R19 laws                     |
| Type assertions   | `pnpm --filter <pkg> test:types`                                           | R2, R4, R13 compile arms              |
| Public surface    | `pnpm --filter <pkg> api:check && pnpm --filter <pkg> attw`                | R24, rollup + types resolution        |
| Lint gates        | `pnpm --filter <pkg> lint`                                                 | R22, U9 rules at error severity       |
| Census guard      | root gate chain runs `scripts/guards/check-declared-span-usage.ts`         | R23, U8                               |
| Witness           | fulfillment trace spec inside the default run                              | R25, AE5                              |
| CI                | `gh pr checks --watch --fail-fast`                                         | `REPO-D1` delivery                    |

Release intents per `REPO-R2` for every package whose build hash moves; the gherkin re-expression ships at `none`.

## Definition of Done

- Every R-ID above is true of the tree, and every AE is exercised by a named test scenario.
- The three new packages and the gherkin re-expression are built, tested, typed, attw-clean, and changeset-tagged; `differential-spec` is untouched (KD7).
- Both lint rules and the census have been observed red on their known-bad fixtures and green after, in their own commits (KTD7).
- The witness Case runs in the default local chain; the daemon second witness, `compare`/`morph`, and OTLP remain deferred work, not silent gaps.
- Abandoned-approach code from this run is deleted, not left in the diff; the tree is restartable (`REPO-D1`).
- Work delivered as a pull request watched to green.
