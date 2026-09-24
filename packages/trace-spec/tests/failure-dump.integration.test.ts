import { expect } from '@effect/vitest'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contract, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it })

const disparityOf = (failure: Contract.CheckFailure<never>): Contract.TraceDisparityError => {
  if (!Schema.is(Contract.TraceDisparityError)(failure)) {
    throw new Error('expected the contract to refuse with a trace disparity')
  }
  return failure
}

const memoryTraceFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => {
    const files = new Map<string, string>()
    return FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          files.set(path, data)
        }),
      readFileString: (path) => Effect.succeed(files.get(path) ?? ''),
    })
  }),
)

type Order = { readonly orderId: string }

const recordSettleAndOrphanCharge = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) =>
    Effect.gen(function*() {
      yield* Span.start(Settle, { 'app.order.id': input.orderId, 'app.order.total': 1 })(Effect.void)
      yield* Span.start(Charge, { 'app.order.id': 'order-8', 'app.order.total': 2 })(Effect.void)
      return input.orderId
    }),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(recordSettleAndOrphanCharge)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

Feature('A failed trace contract')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, memoryTraceFileSystem))
  .body(({ scenario }) => {
    scenario(
      'A charge recorded outside its settlement parent is written down',
      Gherkin.Do.pipe(
        Given('an order whose settlement recorded a charge outside its parent')(
          'order',
          () => Effect.succeed({ orderId: 'order-7' }),
        ),
        When('the settlement is held to the contract')(
          'refusal',
          (s) => Effect.flip(Contract.check(chargeBeneathSettlement, s.order)).pipe(Effect.map(disparityOf)),
        ),
        Then('the refusal names the parent it inspected and where the trace was written')((s) => {
          expect(s.refusal.relationId).toContain('child(fulfillment.settle')
          expect(s.refusal.breaks).toHaveLength(1)
          expect(s.refusal.breaks[0]?.inspected).toHaveLength(2)
          expect(s.refusal.dumpPath).toContain('artifacts/traces/')
          expect(s.refusal.dumpPath).toContain(s.refusal.traceId)
        }),
        And('the written trace names both recorded spans')((s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const dump = s.refusal.dumpPath === null ? '' : yield* fs.readFileString(s.refusal.dumpPath)
            expect(dump).toContain('fulfillment.settle')
            expect(dump).toContain('credit.charge')
            expect(dump).toContain(s.refusal.traceId)
          })
        ),
      ),
    )
  })
