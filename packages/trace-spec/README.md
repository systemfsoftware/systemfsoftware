# @systemfsoftware/trace-spec

Hold a behaviour to the trace it produced.

In a system with queues, workers, and background consumers, a `200` is not the observable output of a behaviour: the response can arrive before the work fails, and the failure lands in a later span nobody is watching. The completed trace is the observable output. This package runs a behaviour under a trace id it owns, reads the finished trace back, decodes it against a declared taxonomy, and answers with a relation that holds or breaks.

## Install

```sh
pnpm add @systemfsoftware/trace-spec @systemfsoftware/trace-taxonomy effect
```

The package exports six capability namespaces — `Contract`, `Graph`, `Observation`, `Rel`, `Stimulus`, `Suite` — plus one driver, `InMemory`. Errors and verdicts belong to the capability that raises them: `Contract.ContractDecodeError`, `Contract.TraceDisparityError`, `Observation.EmptyObservationError`, `Suite.StimulusFailure`, and `Rel.Hold`/`Rel.Break`/`Rel.Verdict`.

## Write a contract

A stimulus is the behaviour under test made callable: `stimulus(input)` runs it under a trace id the contract owns, injecting the matching `traceparent`. A relation is the judgement made callable: `relation(graph)` answers a verdict.

```ts
import { Contract, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { checkout, PaymentCapture, PlaceOrder } from './checkout.span.js'

const placeOrder = Stimulus.make({
  name: 'checkout.place',
  run: ({ input, traceparent }) => client.place(input, { traceparent }),
})

const paymentUnderCheckout = Contract.of(checkout)
  .stimulate(placeOrder)
  .holds(Rel.all(
    Rel.exists(PlaceOrder),
    Rel.child(PlaceOrder, PaymentCapture),
    Rel.attrs(PlaceOrder, { 'app.order.items.count': 1 }),
  ))
```

`Contract.of(taxonomy)` takes the identity first; `Contract.stimulate` and `Contract.holds` are `dual` combinators on Pipeable stages, so the same builder composes in a pipe — `Contract.of(checkout).pipe(Contract.stimulate(placeOrder), Contract.holds(relation))` — and the stage types refuse an out-of-order builder.

## Run the contract

`Contract.cell(contract)` turns a composed spec into a cell over `Contract.Judgment` — the run, the verdict, and the dump path. Its stages are a fixed sandwich: `read` stimulates the behaviour under its minted trace and collects that trace's spans, `decode` builds the span graph purely (`Graph.decode` answers `Result<TraceGraph, Contract.ContractDecodeError>`), `decide` evaluates the relation, `encode` renders the evidence, and `write` persists it on a break. Behaviour failures stay on the cell's error channel; infrastructure refusals — `Contract.ContractDecodeError` or `Observation.EmptyObservationError` — are typed outcomes, never breaks.

`Contract.check(contract, input)` is the test edge over that cell: on a break it writes the decoded graph under `artifacts/traces/` and fails with the disparity, so exactly one dump is written per failing run. Navigation over the decoded graph is standalone: `Graph.byId`, `Graph.children`, and `Graph.descendants`.

| Outcome                                       | Failure                             | Meaning                                                                                 |
| --------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| The relation broke                            | `Contract.TraceDisparityError`      | names the broken conjunct, the spans inspected, and where the decoded graph was written |
| A contracted span lacked a required attribute | `Contract.ContractDecodeError`      | names the declaration and the attribute — never reported as a broken relation           |
| Nothing ran under the owned trace             | `Observation.EmptyObservationError` | the observation was empty, which is its own outcome, not a break                        |

## Register cases

```ts
import { NodeFileSystem } from '@effect/platform-node'
import { it, layer } from '@effect/vitest'
import { InMemory, Observation, Suite } from '@systemfsoftware/trace-spec'
import { Layer } from 'effect'

const TraceSuite = Suite.make({ it, layer })
const harness = Layer.mergeAll(InMemory.layer(InMemory.make()), NodeFileSystem.layer, CheckoutDoubles)

TraceSuite('checkout.place_order')
  .withScenarioLayer(harness)
  .body(({ Case }) => {
    Case('one item is paid for under the order', paymentUnderCheckout, { userId, items: 1 })
  })
```

`Suite.make({ it, layer })(name)` stages a suite as a Pipeable builder, and `withLayer`/`withScenarioLayer` are `dual` combinators whose terminal `body` registers the cases. The scenario layer is built fresh per case and must provide `Observation.Observation` and a `FileSystem` for failure dumps, plus whatever the stimulated behaviour needs — the requirement is enforced at the type level. A failing case fails with the harness's own error channel — the three outcomes above, or `Suite.StimulusFailure` when the behaviour itself failed before its trace could be judged. Cases run on the live clock.

`.withLayer(shared)` registers the suite over a layer built once for the whole suite; the shared layer then carries the observation harness, and `.withScenarioLayer(scenario)` can follow it for what each case needs fresh.

`Case.prop(title, contract, schema)` runs the contract over inputs drawn from the Schema's derived arbitrary through `it.effect.prop` on the suite's runner, so shrinking is the runner's own: a failing draw fails the property and the runner reports the smallest failing input. The dump is named after the case title, so every failing draw overwrites one file and the surviving dump is the reported counterexample's evidence. When a case fails with a `Contract.TraceDisparityError`, the test carries a Vitest annotation naming that dump, so the decoded graph is found from the failing test.

## Observe in memory

`InMemory.make(options?)` builds a cold spec — `InMemory.make()` or `InMemory.make({ serviceName: 'my-service' })` to name the exported resource. `InMemory.layer(spec)` installs the Effect tracer backed by an OpenTelemetry in-memory exporter with a simple span processor and an always-on sampler, and provides `Observation.Observation` for reading a trace back. `InMemory.scoped(spec)` acquires the hot handle directly; each acquisition owns its exporter and tracer provider in private slots and shuts the provider down on release, so two acquisitions never see each other's spans. The driver is the only module that touches the OpenTelemetry SDK; the `Observation` contract itself imports nothing from it. The export happens outside any test-clock boundary.

## Relations

`Rel.exists`, `Rel.absent`, `Rel.unique`, `Rel.child`, `Rel.descendant`, `Rel.status`, `Rel.errorType`, `Rel.attrs`, `Rel.durationLessThan`, `Rel.forall`, `Rel.event`, `Rel.order`, `Rel.any`, `Rel.not`, `Rel.soft`, `Rel.all`, `Rel.fromTaxonomy`.

A relation is callable: `relation(graph)` answers a `Rel.Verdict` — `Rel.Hold` or `Rel.Break` — carrying the conjunct and the span ids it inspected, so the failure output names what broke without a debugger.

`Rel.forall(spec, predicate, detail)` holds when the span was emitted and every node satisfies the predicate; `Rel.event(spec, name)` when every node carries that event; `Rel.order(before, after)` when every `after` span starts at or after some `before` span. All three break when no matching span was emitted. `Rel.any(...relations)` holds when one conjunct holds and names every conjunct when none does; `Rel.not(relation)` holds when its inner relation breaks. `any` and `not` are never soft.

`Rel.fromTaxonomy(taxonomy, { path })` turns the taxonomy itself into a relation: every declared edge must place each child span under a matching parent (directly for `child`, anywhere above for `descendant`), and every forbidden span must be absent unless its `unless` tag names the given path. Edges constrain placement, not existence — pair it with `Rel.exists` for the spans a scenario requires.

`Rel.all` evaluates hard conjuncts in order and stops at the first hard break; soft conjuncts are all evaluated and reported together. `exists` and `absent` are never soft — a spec cannot go green while the span it is about is missing. `Rel.soft` marks a relation soft when it is softenable at all.

## Assert the graph, not the tool

Span names and attributes come from [`@systemfsoftware/trace-taxonomy`](../trace-taxonomy) declarations, so no spec mentions a raw span name. A renamed span or a new required attribute is a compile error at the declaration's start call sites, not a silently green suite.
