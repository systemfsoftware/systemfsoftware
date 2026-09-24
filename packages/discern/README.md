# @systemfsoftware/discern

Branch on what a model thinks, the way you branch on data. discern turns classification, rating and probability questions answered by Effect's `DecisionModel` into patterns you compose with `and`, `or` and `when`, then match exhaustively. Every pattern is three-valued: `Match`, `Miss`, or `Uncertain`. So when the model is not confident, your code says so instead of guessing.

A policy asks every question it needs in one model call. Its answers can be recorded, replayed without a model, cached, and billed against a budget.

## Install

```sh
pnpm add @systemfsoftware/discern effect@4.0.0-rc.116
```

`effect` is a peer dependency: this package declares it but does not install it, so one copy is shared with the rest of your project.

## Quick start

A review policy blocks a risky breaking change, asks for a migration guide on any other breaking change, and ships everything else:

```ts
import { Discern } from '@systemfsoftware/discern'
import { Effect, Schema } from 'effect'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'

// A stand-in model that answers every requested decision with `answer`.
// A real one comes from any Effect `DecisionModel` provider.
const standIn = (answer: (decision: Discern.AnyDecision) => DecisionModel.ProviderAnswer) =>
  Discern.Model.provider((request) =>
    Effect.succeed({
      answers: Object.fromEntries(Object.entries(request.decisions).map(([key, decision]) => [key, answer(decision)])),
      usage: { inputTokens: undefined, outputTokens: undefined },
    })
  )

const Change = Discern.on(Schema.String)

const impact = Change.classify({
  id: 'impact',
  instructions: 'How does this change affect callers of the API?',
  criteria: {
    none: 'Internal only',
    additive: 'New surface, nothing existing changes',
    breaking: 'Existing callers must change',
  },
})
const risk = Change.probability({ id: 'risk', instructions: 'Is this change likely to cause a regression?' })

const review = Discern.type(Schema.String).pipe(
  Discern.when(Discern.and(impact.is('breaking'), risk.above(0.8)), (change) => `block: ${change}`),
  Discern.when(impact.is('breaking'), (change) => `migration guide: ${change}`),
  Discern.orElse((change) => `ship: ${change}`),
)

const cautious = standIn((decision) =>
  decision._tag === 'Classify'
    ? { _tag: 'Classify', label: 'breaking', probabilities: { none: 0.02, additive: 0.08, breaking: 0.9 } }
    : { _tag: 'Probability', probability: 0.93 }
)

const verdict = await Effect.runPromise(
  review('rename User.id to User.key').pipe(Effect.provide(Discern.Model.layer(cautious))),
)
console.log(verdict) // block: rename User.id to User.key
```

`review` is an Effect function. Both questions went to the model in a single call, and the handler only ran after the policy picked its case.

## Usage

### Patterns

| Build                                             | From              | Matches when                                            |
| ------------------------------------------------- | ----------------- | ------------------------------------------------------- |
| `Change.classify({ id, instructions, criteria })` | a set of labels   | `.is(label)` is the answered label                      |
| `Change.rate({ id, instructions, criteria })`     | an ordered scale  | `.atLeast(level)`, `.atMost(level)` compare by position |
| `Change.probability({ id, instructions })`        | a yes/no question | `.above(p)` clears the threshold                        |
| `Discern.deterministic(predicate, { id })`        | plain code        | the predicate holds; no model call                      |
| `Discern.and`, `Discern.or`, `Discern.not`        | other patterns    | three-valued logic: `Uncertain` stays `Uncertain`       |

A deterministic pattern that already settles an `and` keeps the model out of the call entirely.

`criteria` must be a finite set of literal labels: an inline object or array, or a value declared `as const`. A set typed `string`, one with a template label such as `` `tone-${string}` ``, or an empty set does not compile, because `.is`, `.atLeast`, `Discern.case`, and `Discern.exhaustive` could no longer refuse a wrong label. For labels known only at runtime, use `Discern.decision` to wrap an effect `Decision.classify`, then read it with `Discern.where`, or route with `Discern.Procedure.registry`.

Every method has a standalone twin for `pipe`: `impact.is('breaking')` and `impact.pipe(Discern.is('breaking'))` build the same pattern, as do `desk.invoke(input)` and `desk.pipe(Discern.Procedure.invoke(input))`.

### Exhaustive match

`Discern.match` dispatches on a classification. `Discern.exhaustive` does not compile until every label has a case:

```ts
const docsFor = Discern.match(impact).pipe(
  Discern.case('none', () => 'no docs'),
  Discern.case('additive', () => 'add a section'),
  Discern.case('breaking', () => 'write a migration guide'),
  Discern.exhaustive,
)
console.log(await Effect.runPromise(docsFor('drop Node 18').pipe(Effect.provide(Discern.Model.layer(cautious)))))
// write a migration guide
```

### When the model is unsure

Give a threshold a `missBelow` and the space between the two numbers is `Uncertain`. A policy with no `onUncertain` handler fails with `UncertainMatchError` rather than falling through to `orElse`:

```ts
const guarded = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.8, { missBelow: 0.5 }), () => 'block', { id: 'high-risk' }),
  Discern.onUncertain((_change, context) => `ask a human (${context.caseId})`),
  Discern.orElse(() => 'ship'),
)
const unsure = standIn(() => ({ _tag: 'Probability', probability: 0.6 }))
console.log(await Effect.runPromise(guarded('bump lodash').pipe(Effect.provide(Discern.Model.layer(unsure)))))
// ask a human (high-risk)
```

`policy.runWithTrace(input)` returns the value together with a trace of every case evaluated, how it resolved, and the answers it used.

### Record, replay, cache, budget

Interceptors decorate the model. `recording` stores every answer, and `Discern.Model.replayLayer` reruns any program from those answers with no model at all:

```ts
const store = Discern.Model.store()
await Effect.runPromise(
  review('rename User.id to User.key').pipe(
    Effect.provide(Discern.Model.layer(cautious, [Discern.Model.recording(store)])),
  ),
)
const recorded = await Effect.runPromise(Discern.Model.snapshot(store))
const replayed = await Effect.runPromise(
  review('rename User.id to User.key').pipe(Effect.provide(Discern.Model.replayLayer(recorded))),
)
console.log(replayed) // block: rename User.id to User.key
```

`caching` answers repeated questions from a store, and `budgeted` counts spend and refuses once a limit is reached. Cached answers do not draw on the budget:

```ts
const cache = Discern.Model.store()
const spend = Discern.Model.budget({ calls: 10 })
const metered = Discern.Model.layer(cautious, [Discern.Model.caching(cache), Discern.Model.budgeted(spend)])
await Effect.runPromise(review('drop Node 18').pipe(Effect.provide(metered)))
await Effect.runPromise(review('drop Node 18').pipe(Effect.provide(metered)))
console.log(await Effect.runPromise(Discern.Model.spent(spend))) // { decisions: 2, calls: 1 }
```

The same stack is a builder: `Discern.Model.model(cautious).recording(store).budgeted(spend).layer` appends one interceptor at a time and compiles the same layer.

Answers are keyed by the question's content and the input's structure. Rewording instructions or reordering criteria is a new question; reordering an input object's keys is not.

Stores and budgets are handles: `Discern.Model.snapshot`, `load`, `get`, `set`, `size`, `clear`, `spent` and `reset` are Effects over them. A recording is plain data: encode the `snapshot` with the `Discern.Model.Observations` schema to save it, and `load` it back. `Discern.Model.intercept(interceptors)` applies the same decorators to a `DecisionModel` layer you already have, such as `TypeSafeDecisionModel.layer({ model: 'jev-latest' })` from `@effect/ai-typesafe` or the OpenRouter layer from `@effect/ai-openrouter`.

### Evaluate thresholds

`Discern.Eval` runs a pattern over labelled examples and reports accuracy, precision, recall and F1. `Eval.calibrate` asks the model once per example and picks the best threshold from those answers; `Eval.sweep` skips examples a deterministic pattern already settles.

### Route between procedures

`Discern.Procedure` routes a request to one of several named procedures with a single classification. The registry takes its members as a record, and each key is that member's id:

```ts
const Ticket = Schema.String
const refunds = Discern.Procedure.make({
  description: 'Refund duplicate or wrong charges',
  input: Ticket,
  run: (ticket) => Effect.succeed(`refund opened for: ${ticket}`),
})
const incidents = Discern.Procedure.make({
  description: 'Outages and production errors',
  input: Ticket,
  run: () => Effect.succeed('incident opened'),
})
const desk = Discern.Procedure.registry(Ticket, { refunds, incidents })

const router = standIn(() => ({
  _tag: 'Classify',
  label: 'incidents',
  probabilities: { refunds: 0.05, incidents: 0.95 },
}))
const torn = standIn(() => ({
  _tag: 'Classify',
  label: 'refunds',
  probabilities: { refunds: 0.52, incidents: 0.48 },
}))
const { route, value } = await Effect.runPromise(
  desk.invokeWithRoute('the API returns 500 for every request').pipe(Effect.provide(Discern.Model.layer(router))),
)
console.log(route._tag, value) // RouteMatched incident opened
const fallback = await Effect.runPromise(
  desk.invoke('hello?', { onUncertain: () => 'ask a human' }).pipe(Effect.provide(Discern.Model.layer(torn))),
)
console.log(fallback) // ask a human
```

A near tie is `RouteUncertain`, never a coin flip. Without `onUncertain`, `invoke` fails with `RoutingUncertainError`; with it, that error leaves the type. Registries also take:

- per-call `routing` thresholds;
- `routeBy`, to route on a projection of the input;
- nested registries, bounded by `Discern.Procedure.withMaxDepth`.

## Entry point

One entry point, `@systemfsoftware/discern`, exporting the `Discern` namespace with `Discern.Model`, `Discern.Eval` and `Discern.Procedure` inside it.

## API

The public surface is generated from the source and versioned with the package: [`etc/discern.api.md`](./etc/discern.api.md).

## License

Apache-2.0. Forked from [doeixd/discern](https://github.com/doeixd/discern). Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/discern#readme).
