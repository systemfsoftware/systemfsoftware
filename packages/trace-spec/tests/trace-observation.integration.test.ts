import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Graph, Observation, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, Layer, Result, Schema } from 'effect'
import { expect } from 'vitest'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it })

const settleOrder = (orderId: string, total: number) =>
  Span.start(Settle, { 'app.order.id': orderId, 'app.order.total': total })(
    Span.start(Charge, { 'app.order.id': orderId, 'app.order.total': total })(Effect.succeed(`settled:${orderId}`)),
  )

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: { readonly orderId: string; readonly total: number } }) =>
    settleOrder(input.orderId, input.total),
})

const observedGraph = (traceId: string) =>
  Effect.gen(function*() {
    const observation = yield* Observation.Observation
    const spans = yield* observation.collect(traceId)
    return Result.getOrThrow(Graph.decode(traceId, spans, FulfillmentTaxonomy))
  })

Feature('Holding a settlement to the trace it produced')
  .withScenarioLayer(ObservationWindow.make('trace-spec').layer)
  .body(({ scenario }) => {
    scenario(
      'A settlement that charges credit records the charge beneath it',
      Gherkin.Do.pipe(
        Given('a settlement that charges credit for an order')(
          'order',
          () => Effect.succeed({ orderId: 'order-7', total: 42 }),
        ),
        When('the settlement runs under a trace of its own')('run', (s) => settlement(s.order)),
        When('the finished trace is read back')('graph', (s) => observedGraph(s.run.traceId)),
        Then('the trace shows the charge beneath the settlement')((s) => {
          const verdict = Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge))(s.graph)
          expect(Schema.is(Rel.Hold)(verdict)).toBe(true)
          expect(s.run.output).toBe('settled:order-7')
        }),
      ),
    )

    scenario(
      'A settlement that never ran leaves nothing to hold it to',
      Gherkin.Do.pipe(
        Given('a trace nobody has run anything under')('idle', () => Stimulus.traceContext),
        When('the finished trace is read back')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const observation = yield* Observation.Observation
              return yield* Effect.flip(observation.collect(s.idle.traceId))
            }),
        ),
        Then('the reader is told the trace was empty rather than that a relation broke')((s) => {
          expect(s.outcome._tag).toBe('EmptyObservationError')
          expect(s.outcome.traceId).toBe(s.idle.traceId)
        }),
      ),
    )

    scenario(
      'Two settlements in one run answer only for their own order',
      Gherkin.Do.pipe(
        Given('a settlement for one order')('first', () => settlement({ orderId: 'order-1', total: 1 })),
        When('a second settlement runs for another order')(
          'second',
          () => settlement({ orderId: 'order-2', total: 2 }),
        ),
        Then('each trace carries only the spans of its own settlement')((s) =>
          Effect.gen(function*() {
            const firstGraph = yield* observedGraph(s.first.traceId)
            const secondGraph = yield* observedGraph(s.second.traceId)
            const orderOf = (graph: Graph.TraceGraph) =>
              Graph.byId(graph, Settle).map((node) => node.attrs['app.order.id'])
            expect(orderOf(firstGraph)).toStrictEqual(['order-1'])
            expect(orderOf(secondGraph)).toStrictEqual(['order-2'])
            expect(firstGraph.traceId).not.toBe(secondGraph.traceId)
          })
        ),
      ),
    )

    scenario(
      'A trace served at one observation window cannot be read at another',
      Gherkin.Do.pipe(
        Given('a settlement was served under its own observation window')('window', () =>
          Effect.scoped(
            Effect.gen(function*() {
              const window = yield* Layer.build(ObservationWindow.make('trace-spec').layer)
              const run = yield* settlement({ orderId: 'order-3', total: 3 }).pipe(Effect.provide(window))
              const spans = yield* Effect.flatMap(
                Observation.Observation,
                (observation) => observation.collect(run.traceId),
              ).pipe(Effect.provide(window))
              const graph = Result.getOrThrow(Graph.decode(run.traceId, spans, FulfillmentTaxonomy))
              return { run, graph }
            }),
          )),
        When('the same trace is asked for at a separate window')('reread', (s) =>
          Effect.scoped(
            Effect.flatMap(Layer.build(ObservationWindow.make('trace-spec').layer), (window) =>
              Effect.flatMap(Observation.Observation, (observation) =>
                observation.collect(s.window.run.traceId)).pipe(
                  Effect.provide(window),
                )).pipe(Effect.flip),
          )),
        Then('the separate window is told there is nothing to read')((s) => {
          expect(s.reread._tag).toBe('EmptyObservationError')
          expect(s.reread.traceId).toBe(s.window.run.traceId)
        }),
        And('the window that served the settlement still answers with its graph')((s) => {
          const verdict = Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge))(s.window.graph)
          expect(Schema.is(Rel.Hold)(verdict)).toBe(true)
        }),
      ),
    )
  })
