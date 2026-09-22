# @systemfsoftware/trace-spec

Hold a behaviour to the trace it produced.

In a system with queues, workers, and background consumers, a `200` is not the observable output of a behaviour: the response can arrive before the work fails, and the failure lands in a later span nobody is watching. The completed trace is the observable output. This package runs a behaviour under a trace id it owns, reads the finished trace back, decodes it against a declared taxonomy, and answers with a relation that holds or breaks.

## Install

```sh
pnpm add @systemfsoftware/trace-spec @systemfsoftware/trace-taxonomy effect
```

## Write a contract

```ts
import { Contract, Observe, Rel, Stimulus } from '@systemfsoftware/trace-spec'
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

`Contract.check(paymentUnderCheckout, input)` mints the trace id, injects `traceparent`, runs the behaviour, collects the finished spans of that trace, decodes them, and evaluates the relation. It answers with the run and the decoded graph, or fails:

| Outcome                                       | Failure                 | Meaning                                                                                 |
| --------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| The relation broke                            | `TraceDisparityError`   | names the broken conjunct, the spans inspected, and where the decoded graph was written |
| A contracted span lacked a required attribute | `ContractDecodeError`   | names the declaration and the attribute — never reported as a broken relation           |
| Nothing ran under the owned trace             | `EmptyObservationError` | the observation was empty, which is its own outcome, not a break                        |

## Register cases

```ts
import { NodeFileSystem } from '@effect/platform-node'
import { it, layer } from '@effect/vitest'
import { Observe, Suite } from '@systemfsoftware/trace-spec'
import { Layer } from 'effect'

const TraceSuite = Suite.make({ it, layer })
const harness = Layer.mergeAll(Observe.inMemory, NodeFileSystem.layer, CheckoutDoubles)

TraceSuite('checkout.place_order')
  .withScenarioLayer(harness)
  .body(({ Case }) => {
    Case('one item is paid for under the order', paymentUnderCheckout, { userId, items: 1 })
  })
```

Each `Case` is one stimulus, one owned trace, one relation. The scenario layer is built fresh per case and must provide `Observe.Observation` and a `FileSystem` for failure dumps, plus whatever the stimulated behaviour needs. A failing case fails with the harness's own error channel — the three outcomes above, or `StimulusFailure` when the behaviour itself failed before its trace could be judged. Cases run on the live clock.

`.withLayer(shared)` registers the suite over a layer built once for the whole suite; the shared layer then carries the observation harness, and `.withScenarioLayer(scenario)` can follow it for what each case needs fresh.

`Case.prop(title, contract, arbitrary)` runs the contract over inputs drawn from a fast-check arbitrary (100 runs). The first failing input is shrunk to a minimal one, re-run, and reported: the case fails with that input's `TraceDisparityError` and names the shrunk input.

When a case fails with a `TraceDisparityError`, the test carries a Vitest annotation naming the dump under `artifacts/traces/`, so the decoded graph is found from the failing test.

## Observe in memory

`Observe.inMemory` installs the Effect tracer backed by an OpenTelemetry in-memory exporter with a simple span processor and an always-on sampler, and provides `Observe.Observation` for reading a trace back. Each acquisition of the layer owns its exporter and tracer provider and shuts the provider down on release, so a case provided the layer as its scenario layer sees only its own spans. The export happens outside any test-clock boundary.

## Relations

`Rel.exists`, `Rel.absent`, `Rel.unique`, `Rel.child`, `Rel.descendant`, `Rel.status`, `Rel.errorType`, `Rel.attrs`, `Rel.durationLessThan`, `Rel.forall`, `Rel.event`, `Rel.order`, `Rel.any`, `Rel.not`, `Rel.soft`, `Rel.all`, `Rel.fromTaxonomy`.

`Rel.forall(spec, predicate, detail)` holds when the span was emitted and every node satisfies the predicate; `Rel.event(spec, name)` when every node carries that event; `Rel.order(before, after)` when every `after` span starts at or after some `before` span. All three break when no matching span was emitted. `Rel.any(...relations)` holds when one conjunct holds and names every conjunct when none does; `Rel.not(relation)` holds when its inner relation breaks. `any` and `not` are never soft.

`Rel.fromTaxonomy(taxonomy, { path })` turns the taxonomy itself into a relation: every declared edge must place each child span under a matching parent (directly for `child`, anywhere above for `descendant`), and every forbidden span must be absent unless its `unless` tag names the given path. Edges constrain placement, not existence — pair it with `Rel.exists` for the spans a scenario requires.

`Rel.all` evaluates hard conjuncts in order and stops at the first hard break; soft conjuncts are all evaluated and reported together. `exists` and `absent` are never soft — a spec cannot go green while the span it is about is missing.

Relations answer a verdict, never a bare boolean: a break carries the conjunct and the span ids it inspected, so the failure output names what broke without a debugger.

## Assert the graph, not the tool

Span names and attributes come from [`@systemfsoftware/trace-taxonomy`](../trace-taxonomy) declarations, so no spec mentions a raw span name. A renamed span or a new required attribute is a compile error at the declaration's start call sites, not a silently green suite.
