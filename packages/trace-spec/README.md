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

## Observe in memory

```ts
Feature('Checkout places an order')
  .withScenarioLayer(Observe.inMemory)
  .liveClock()
  .body(({ scenario }) => {/* … */})
```

`Observe.inMemory` installs the Effect tracer backed by an OpenTelemetry in-memory exporter with a simple span processor and an always-on sampler, and provides `Observe.Observation` for reading a trace back. Specs isolate by the trace id each one owns, so two specs in one process never see each other's spans. Observation runs on the live clock: the export happens outside any test-clock boundary.

## Relations

`Rel.exists`, `Rel.absent`, `Rel.unique`, `Rel.child`, `Rel.descendant`, `Rel.status`, `Rel.errorType`, `Rel.attrs`, `Rel.durationLessThan`, `Rel.soft`, `Rel.all`.

`Rel.all` evaluates hard conjuncts in order and stops at the first hard break; soft conjuncts are all evaluated and reported together. `exists` and `absent` are never soft — a spec cannot go green while the span it is about is missing.

Relations answer a verdict, never a bare boolean: a break carries the conjunct and the span ids it inspected, so the failure output names what broke without a debugger.

## Assert the graph, not the tool

Span names and attributes come from [`@systemfsoftware/trace-taxonomy`](../trace-taxonomy) declarations, so no spec mentions a raw span name. A renamed span or a new required attribute is a compile error at the declaration's start call sites, not a silently green suite.
