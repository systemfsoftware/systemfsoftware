---
title: 'refactor: api-extractor immutable core and cells'
type: refactor
status: active
date: 2026-09-23
---

# api-extractor: immutable core, cells, no class hierarchies

## Goal

Every file in `packages/api-extractor/src` and its tests conforms to every rule in
`compound-packs/cell-architecture`, `compound-packs/boundary-testing`, and
`skill://architect-property-tests`. `packages/effect-microsandbox` is the bar. Output
stays byte-identical to `dec37275d0e`.

The previous overhaul kept upstream's object graph: 38 `Pipeable.Class` classes, 919
branch sites, 111 `let`s, mutable `Map`/`Set` caches, hand-rolled comparators, and
file I/O in the middle of analysis. None of that survives.

## Gates (all must be green at the end)

| Gate                            | Command                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Lint (bar config, no overrides) | `pnpm --filter @systemfsoftware/api-extractor lint`                                        |
| Conformance (ephemeral)         | `node /tmp/api-extractor-conformance/check-conformance.mjs` prints `97/97`-style full pass |
| Types                           | `pnpm --filter @systemfsoftware/api-extractor typecheck`                                   |
| Tests                           | `pnpm --filter @systemfsoftware/api-extractor test` and `test:e2e`                         |
| Build and surface               | `build`, `dts:check`, `attw`                                                               |
| Parity (ephemeral)              | `node /tmp/api-extractor-characterization/check-parity.mjs` prints `parity: 0 differing`   |
| Repo                            | `pnpm check:local`                                                                         |

## Law, restated as code shapes

- **Classes:** only `Schema.Class`, `Schema.TaggedClass`, `Schema.TaggedError`,
  `Data.TaggedClass`, `Data.Class`, `Context.Service`. No `Pipeable.Class`, no
  inheritance between our own types, no static-method holder classes.
- **Modules own behaviour:** a data module exports the type, constructors, its
  `Order`/`Equivalence`, and `dual` combinators. No free-floating comparator
  functions, no `.sort(compareFn)`; use `Arr.sort(Order)`, `Order.mapInput`,
  `Order.combine`.
- **No mutation:** no `let`/`var`, loops, assignment, `++`, `delete`, mutating methods,
  `new Map`/`Set`. Pure code folds (`Arr.reduce`, `Arr.map`, `HashMap`, `HashSet`,
  `Chunk`). Effect code keeps per-run state in `Ref.Ref<ImmutableValue>`.
- **No branches outside cell shells:** `Match.value`/`Match.tag`/`Match.when` +
  `Match.exhaustive`/`Match.orElse`, `Option`/`Result` pipes, `Predicate`. TS node
  narrowing uses `ts.isX` guards inside `Match.when`/`Option.liftPredicate`, never `as`.
- **No casts, no throws:** no `as`, `!`, `<T>`, `JSON.parse`, `throw`, `try`. JSON is
  decoded with `Schema.fromJsonString(...)`. Failures are `Result.fail`/`Effect.fail`
  with a tagged error; broken invariants are `Effect.die(new InternalInvariantError)`
  inside Effect code only.
- **I/O only in cell read/write phases:** `FileSystem`, `Path` service values, `ts.sys`,
  `process`, `console`, `node:*` appear only in `*.cell.ts`, `src/drivers/`, `src/cli*`.
  Pure modules receive pre-read data.
- **Cells:** `Sandwich.named(...)` read → (decode) → decide(`Workflow.make`/`total`) →
  (encode) → write; composed with `Cell.andThen`/`Cell.zip`/`Cell.collect`. Only the
  CLI runs a cell.
- **Tests:** properties only in `*.property.test.ts` via `it.prop` with schemas passed
  directly (no `Arbitrary.schema` wrapping), boolean verdict on every path, no
  `expect` inside predicates, no `.filter` on arbitraries, no `numRuns` literals, no
  mocks. Refined schemas get refusal tests.

## Key decisions

- **D1 Identity.** Graph keys are the compiler's own stable ids:
  `ts.getSymbolId(symbol)` and `ts.getNodeId(node)`, exposed through a typed module
  augmentation (`src/analyzer/typescript-internal.d.ts`), branded `SymbolId`/`NodeId`.
  Never key a `HashMap` by a `ts.Symbol`/`ts.Node`: Effect v4 hashes plain objects
  structurally (`repos/effect/packages/effect/src/Hash.ts:103-155`), and
  `Equal.byReferenceUnsafe` mutates a module-global `WeakSet`.
- **D2 Records hold ids, lookups hold compiler objects.** Entity records
  (`AstSymbol`, `AstDeclaration`, `AstModule`, `AstImport`, `AstNamespaceImport`,
  `CollectorEntity`, metadata) are `Data.TaggedClass` values whose fields are ids and
  primitives. The graph snapshot carries `HashMap<SymbolId, ts.Symbol>` and
  `HashMap<NodeId, ts.Node>` lookups; compiler objects are values, never keys.
- **D3 Querying the compiler is the read phase.** `ts.TypeChecker` is a stateful external
  oracle (it caches as it is queried), so walking it to build the graph happens in the
  analysis cell's read phase as `Effect` code threading `Ref.Ref<AnalysisGraph>`. The
  walk keeps upstream's call order exactly (memoize-on-first-fetch, recursion order),
  because output order depends on it. Everything after the walk is pure.
- **D4 Pre-read files.** `package.json` lookups, `tsdoc-metadata.json` probes, source
  maps and their original sources are read by cell read phases and handed to pure code
  as `HashMap<string, …>` indexes. Messages carry raw `.d.ts` positions; a pure decode
  step maps them through the pre-read source maps before routing and sorting.
- **D5 Pure renderers.** `Span` becomes an immutable tree plus a
  `HashMap<spanKey, SpanModification>`; rendering is a pure fold. `IndentedWriter`
  becomes an immutable `TextWriter` value with `dual` operations and a scoped-indent
  combinator that takes `(writer) => writer`.
- **D6 Enhancers are folds.** Doc-comment and validation enhancement return new
  metadata maps and appended messages; they never mutate tsdoc objects. TSDoc mutation
  that feeds only the docModel (`inheritDoc` copying, param clearing) is deleted: this
  engine writes no docModel.
- **D7 Messages.** `ExtractorMessage` is an immutable data class with
  `ExtractorMessage.Order` (file path, line, message id). `MessageLog` is an immutable
  value (`Chunk` + association index + handled set) in the graph state.
- **D8 Cells.** `locateConfig` (CLI config search), `announceRun` (read raw config
  chain → decode config → decide verbosity → write banner), `extractApi` (read:
  compile, pre-read index, walk graph, baselines, source maps → decode: metadata,
  enhancers, renders, located messages → decide: `chooseExtraction` → encode: write
  plan → write), `initConfig` (decide create vs refuse → write template). Composition is
  `Cell.andThen`; `Extractor.run` is the composed cell's `run` property, not a call.
- **D9 Walker placement.** The graph walker lives in non-cell modules
  (`analyzer/*.ts`) as `Effect` programs over `Ref` with `Match`-only control flow and
  no I/O imports. It decides only what to fetch next; domain rulings (release tags,
  names for emit, report outcomes, message routing) happen in pure decode/decide code.
  The read phase that calls it sequences and decides nothing (two-regimes core/shell).
- **D10 Span keys.** A span is keyed by `ts.getNodeId` of its node. Generator visitors
  fold over the tree and return updates to any span's `SpanModification` in a
  `HashMap<NodeId, SpanModification>`; rendering reads that map.

## Test layers admitted

- Workflows: colocated `src/__tests__/*.workflow.property.test.ts` only.
- Schemas: generated codec laws (`schema-laws.test.ts`) plus refusal tests for every
  refined schema.
- Cells and composition: in-process integration features through the `Extractor`
  namespace against temp copies of fixtures (no process spawning).
- CLI: the existing three e2e journeys in `tests/e2e/`; no new journeys.
- Vendor pin: `tests/vendor-pins.differential.test.ts` stays.
- Refused: unit tests for pure helper modules, renderers, or the walker. They are
  covered through the integration features and the parity gate.

## Waves and ownership

Workers share one checkout. Each owns only its listed files; importers outside the list
may change only their import lines. No git writes by workers.

| Wave | Owner                | Files                                                                                                                                                                                                                                                                                                             |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A   | helpers              | `src/analyzer/{TypeScriptHelpers,TypeScriptInternals,SyntaxHelpers,SourceFileLocationFormatter,path-helpers,text}.ts`, `src/collector/{package-name,extractor-message-id,VisitorState}.ts`, `src/model/**`, `src/utils/**`, new `src/analyzer/typescript-internal.d.ts`                                           |
| 1B   | config + CLI         | `src/config/**`, `src/compiler/**`, `src/cli/**`, `src/cli.ts`, `src/drivers/**`, `src/announce-run.cell.ts`, new `locate-config.cell.ts`, `init-config.cell.ts`                                                                                                                                                  |
| 1C   | message presentation | `src/collector/{message-router,message-router.schema,route-extractor-message.workflow,resolve-verbosity.workflow,verbosity.schema}.ts`                                                                                                                                                                            |
| 2    | core graph           | `src/analyzer/{Ast*,ExportAnalyzer,AstReferenceResolver,PackageMetadataManager,package-json-lookup}.ts`, `src/collector/{Collector,CollectorEntity,ApiItemMetadata,SymbolMetadata,DeclarationMetadata,WorkingPackage,package-doc-comment,message-log,sort,SourceMapper,source-map.schema}.ts`, `src/enhancers/**` |
| 3    | renderers            | `src/analyzer/{Span,indented-writer}.ts`, `src/generators/**`                                                                                                                                                                                                                                                     |
| 4    | cells                | `src/extract-api.cell.ts`, `src/run-extractor.ts`, `src/extraction-request*.ts`, `src/write-plan.schema.ts`, `src/choose-extraction.workflow.ts`, `src/Extractor/mod.ts`, `src/index.ts`, `src/errors/**`, `src/message-writer.service.ts`, `src/version.ts`                                                      |
| 5    | tests                | `src/__tests__/**`, `src/schema-laws.test.ts`, `tests/**`                                                                                                                                                                                                                                                         |

Each wave ends with: owned files at zero conformance hits, `typecheck` and `test`
green, and `check-parity.mjs` at `parity: 0 differing`. The orchestrator commits per
wave.
