# @systemfsoftware/trace-spec

Hold a behaviour to the trace it produced.

In a system with queues, workers, and background consumers, a `200` is not the observable output of a behaviour: the response can arrive before the work fails, and the failure lands in a later span nobody is watching. The completed trace is the observable output. This package runs a behaviour under a trace id it owns, reads the finished trace back, decodes it against a declared taxonomy, and answers with a relation that holds or breaks.

## Install

```sh
pnpm add @systemfsoftware/trace-spec @systemfsoftware/trace-taxonomy effect
```

The package exports nine namespaces — `Contract`, `Graph`, `Observation`, `ObservationWindow`, `RemoteObservation`, `Rel`, `Stimulus`, `Suite`, `TempoTraceStore`. Errors and verdicts belong to the capability that raises them: `Contract.ContractDecodeError`, `Contract.TraceDisparityError`, `Observation.EmptyObservationError`, `Observation.IncompleteObservationError`, `Observation.TransportObservationError`, `Suite.StimulusFailure`, and `Rel.Hold`/`Rel.Break`/`Rel.Verdict`.

## Write a contract

A stimulus is the behaviour under test made callable: `stimulus(input)` runs it under a trace id the contract owns, injecting the matching `traceparent`. A relation is the judgement made callable: `relation(graph)` answers a verdict.

```ts
import { Contract, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { checkout, PaymentCapture, PlaceOrder } from './checkout.schema.js'

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

`Contract.judge(contract, input)` stimulates the behaviour under its minted trace, collects that trace's spans, decodes them against the taxonomy (`Graph.decode` answers `Result<TraceGraph, Contract.ContractDecodeError>`), applies the relation, and on a break writes the decoded graph under `artifacts/traces/`. It answers a `Contract.Judgment` — the run, the verdict, and the dump path — so a break is a value, not a failure. Behaviour failures and infrastructure refusals (`Contract.ContractDecodeError` and the three `Observation` failures) stay on the error channel.

`Contract.check(contract, input)` is the test edge over `judge`: a break fails with `Contract.TraceDisparityError`. Navigation over the decoded graph is standalone: `Graph.byId`, `Graph.children`, and `Graph.descendants`.

| Outcome                                       | Failure                                  | Meaning                                                                                            |
| --------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The relation broke                            | `Contract.TraceDisparityError`           | names the broken conjunct, the spans inspected, and where the decoded graph was written            |
| A contracted span lacked a required attribute | `Contract.ContractDecodeError`           | names the declaration and the attribute — never reported as a broken relation                      |
| Nothing ran under the owned trace             | `Observation.EmptyObservationError`      | the observation was empty, which is its own outcome, not a break                                   |
| The trace never finished arriving             | `Observation.IncompleteObservationError` | spans were read but kept changing, or the store marked the trace partial; carries the span count   |
| The trace store could not be read             | `Observation.TransportObservationError`  | the store refused, was unreachable, or answered a body that does not decode; names the request URL |

## Register cases

```ts
import { NodeFileSystem } from '@effect/platform-node'
import { it, layer } from '@effect/vitest'
import { Observation, ObservationWindow, Suite } from '@systemfsoftware/trace-spec'
import { Layer } from 'effect'

const TraceSuite = Suite.make({ it, layer })
const harness = Layer.mergeAll(ObservationWindow.make('checkout').layer, NodeFileSystem.layer, CheckoutDoubles)

TraceSuite('checkout.place_order')
  .withScenarioLayer(harness)
  .body(({ Case }) => {
    Case('one item is paid for under the order', paymentUnderCheckout, { userId, items: 1 })
  })
```

`Suite.make({ it, layer })(name)` stages a suite as a Pipeable builder, and `withLayer`/`withScenarioLayer` are `dual` combinators whose terminal `body` registers the cases. The scenario layer is built fresh per case and must provide `Observation.Observation` and a `FileSystem` for failure dumps, plus whatever the stimulated behaviour needs — the requirement is enforced at the type level. A failing case fails with the harness's own error channel — the outcomes above, or `Suite.StimulusFailure` when the behaviour itself failed before its trace could be judged. Cases run on the live clock.

`.withLayer(shared)` registers the suite over a layer built once for the whole suite; the shared layer then carries the observation harness, and `.withScenarioLayer(scenario)` can follow it for what each case needs fresh.

`Case.prop(title, contract, schema)` runs the contract over inputs drawn from the Schema's derived arbitrary through `it.effect.prop` on the suite's runner, so shrinking is the runner's own: a failing draw fails the property and the runner reports the smallest failing input. The dump is named after the case title, so every failing draw overwrites one file and the surviving dump is the reported counterexample's evidence. When a case fails with a `Contract.TraceDisparityError`, the test carries a Vitest annotation naming that dump, so the decoded graph is found from the failing test.

## Observe in memory

`ObservationWindow.make(serviceName)` is the cold resource; the service name is required. `.scoped` acquires an `ObservationWindow` handle for one scope — an OpenTelemetry in-memory exporter behind a simple span processor and an always-on sampler, shut down when the scope closes — and `ObservationWindow.collect(window, traceId)` reads one trace back. `.layer` binds a window as `Observation.Observation` plus the Effect tracer, one window per layer build, so two acquisitions never see each other's spans. Only the handle module imports the OpenTelemetry SDK. The export happens outside any test-clock boundary.

## Observe a remote store

When the behaviour runs in another process — a CLI binary, a worker, a container — its spans never reach an in-memory window. Export them to a trace store and read them back with `RemoteObservation.layer`, which provides `Observation.Observation` over a trace source:

```ts
import { RemoteObservation, TempoTraceStore } from '@systemfsoftware/trace-spec'
import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'

const observation = RemoteObservation.layer(
  TempoTraceStore.source({ baseUrl: 'http://127.0.0.1:3200' }),
  { interval: '50 millis', settle: '500 millis', timeout: '10 seconds' },
).pipe(Layer.provide(FetchHttpClient.layer))
```

`collect(traceId)` reads the source every `interval` and keeps every span it has seen, keyed by span id. It answers once no read has added a span for `settle`, because no trace store says when a trace is complete: a trace read too early looks finished but is missing spans still in flight. A read that returns fewer spans than an earlier one never drops a span. The whole read runs under `timeout`, and a read still in flight at the deadline is cancelled: nothing read by then fails with `Observation.EmptyObservationError`, spans that never settled fail with `Observation.IncompleteObservationError`. A source failure fails at once, without retrying. Every duration must be positive.

`TempoTraceStore.source({ baseUrl })` reads Grafana Tempo's `GET /api/v2/traces/<traceId>` once. It needs only an `HttpClient`, so auth and tenant headers go on the client you provide: `HttpClient.mapRequest(client, HttpClientRequest.setHeader('X-Scope-OrgID', tenant))`. A trace Tempo marks `PARTIAL` fails with `Observation.IncompleteObservationError`; a non-2xx answer, including `404`, or a body that does not decode fails with `Observation.TransportObservationError`.

Another store needs only another source: a `RemoteObservation.TraceSource<R>` is one read that answers the spans the store holds for a trace id now — empty when it holds none — or fails with `Observation.TransportObservationError` or `Observation.IncompleteObservationError`. It never polls, waits, or retries; the layer owns the cadence.

## Relations

`Rel.exists`, `Rel.absent`, `Rel.unique`, `Rel.child`, `Rel.descendant`, `Rel.status`, `Rel.errorType`, `Rel.attrs`, `Rel.durationLessThan`, `Rel.forall`, `Rel.event`, `Rel.order`, `Rel.any`, `Rel.not`, `Rel.soft`, `Rel.all`, `Rel.fromTaxonomy`.

A relation is callable: `relation(graph)` answers a `Rel.Verdict` — `Rel.Hold` or `Rel.Break` — carrying the conjunct and the span ids it inspected, so the failure output names what broke without a debugger.

`Rel.forall(spec, predicate, detail)` holds when the span was emitted and every node satisfies the predicate; `Rel.event(spec, name)` when every node carries that event; `Rel.order(before, after)` when every `after` span starts at or after some `before` span. All three break when no matching span was emitted. `Rel.any(...relations)` holds when one conjunct holds and names every conjunct when none does; `Rel.not(relation)` holds when its inner relation breaks. `any` and `not` are never soft.

`Rel.fromTaxonomy(taxonomy, { path })` turns the taxonomy itself into a relation: every declared edge must place each child span under a matching parent (directly for `child`, anywhere above for `descendant`), and every forbidden span must be absent unless its `unless` tag names the given path. Edges constrain placement, not existence — pair it with `Rel.exists` for the spans a scenario requires.

`Rel.all` evaluates hard conjuncts in order and stops at the first hard break; soft conjuncts are all evaluated and reported together. `exists` and `absent` are never soft — a spec cannot go green while the span it is about is missing. `Rel.soft` marks a relation soft when it is softenable at all.

## Assert the graph, not the tool

Span names and attributes come from [`@systemfsoftware/trace-taxonomy`](../trace-taxonomy) declarations, so no spec mentions a raw span name. A renamed span or a new required attribute is a compile error at the declaration's start call sites, not a silently green suite.
