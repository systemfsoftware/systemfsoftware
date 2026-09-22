import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Graph, Observe, Rel, Stimulus, Verdict } from '@systemfsoftware/trace-spec'
import { Effect, Schema } from 'effect'
import { expect } from 'vitest'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it, layer })

const settleOrder = (orderId: string, total: number) =>
  Settle.start({ 'app.order.id': orderId, 'app.order.total': total })(
    Charge.start({ 'app.order.id': orderId, 'app.order.total': total })(Effect.succeed(`settled:${orderId}`)),
  )

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: { readonly orderId: string; readonly total: number } }) =>
    settleOrder(input.orderId, input.total),
})

const observedGraph = (traceId: string) =>
  Effect.gen(function*() {
    const observation = yield* Observe.Observation
    const spans = yield* observation.collect(traceId)
    return yield* Graph.decode(traceId, spans, FulfillmentTaxonomy)
  })

Feature('Holding a settlement to the trace it produced')
  .withScenarioLayer(Observe.inMemory)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A settlement that charges credit records the charge beneath it',
      Gherkin.Do.pipe(
        Given('a settlement that charges credit for an order')(
          'order',
          () => Effect.succeed({ orderId: 'order-7', total: 42 }),
        ),
        When('the settlement runs under a trace of its own')('run', (s) => settlement.run(s.order)),
        When('the finished trace is read back')('graph', (s) => observedGraph(s.run.traceId)),
        Then('the trace shows the charge beneath the settlement')((s) => {
          const verdict = Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)).evaluate(s.graph)
          expect(Schema.is(Verdict.Hold)(verdict)).toBe(true)
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
              const observation = yield* Observe.Observation
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
        Given('a settlement for one order')('first', () => settlement.run({ orderId: 'order-1', total: 1 })),
        When('a second settlement runs for another order')(
          'second',
          () => settlement.run({ orderId: 'order-2', total: 2 }),
        ),
        Then('each trace carries only the spans of its own settlement')((s) =>
          Effect.gen(function*() {
            const firstGraph = yield* observedGraph(s.first.traceId)
            const secondGraph = yield* observedGraph(s.second.traceId)
            const orderOf = (graph: Graph.TraceGraph) => graph.byId(Settle).map((node) => node.attrs['app.order.id'])
            expect(orderOf(firstGraph)).toStrictEqual(['order-1'])
            expect(orderOf(secondGraph)).toStrictEqual(['order-2'])
            expect(firstGraph.traceId).not.toBe(secondGraph.traceId)
          })
        ),
      ),
    )
  })
