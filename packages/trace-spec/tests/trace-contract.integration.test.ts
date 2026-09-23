import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contract, Observation, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { expect } from 'vitest'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it, layer })

type CheckFailure =
  | Contract.ContractDecodeError
  | Observation.EmptyObservationError
  | Contract.TraceDisparityError

const disparityOf = (failure: CheckFailure): Contract.TraceDisparityError => {
  if (!Schema.is(Contract.TraceDisparityError)(failure)) {
    throw new Error('expected the contract to refuse with a trace disparity')
  }
  return failure
}

const recordingFileSystem = Layer.effect(
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

type Order = { readonly orderId: string; readonly charge: boolean }

const settleOrder = (order: Order) => {
  const attrs = { 'app.order.id': order.orderId, 'app.order.total': 9 }
  const settled = Effect.succeed(`settled:${order.orderId}`)
  return Span.start(Settle, attrs)(order.charge ? Span.start(Charge, attrs)(settled) : settled)
}

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) => settleOrder(input),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

Feature('Settling an order under a contract that names the charge')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, recordingFileSystem))
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A settlement that charges credit satisfies the contract',
      Gherkin.Do.pipe(
        Given('an order whose settlement charges credit')(
          'order',
          () => Effect.succeed({ orderId: 'order-11', charge: true }),
        ),
        When('the settlement is held to the contract')(
          'checked',
          (s) => Contract.check(chargeBeneathSettlement, s.order),
        ),
        Then('the settlement is accepted and its charge is on the same trace')((s) => {
          expect(s.checked.run.output).toBe('settled:order-11')
          expect(Schema.is(Rel.Hold)(s.checked.verdict)).toBe(true)
        }),
      ),
    )

    scenario(
      'A settlement that quietly skips the charge is refused',
      Gherkin.Do.pipe(
        Given('an order whose settlement never charges credit')(
          'order',
          () => Effect.succeed({ orderId: 'order-12', charge: false }),
        ),
        When('the settlement is held to the contract')(
          'refusal',
          (s) => Effect.flip(Contract.check(chargeBeneathSettlement, s.order)).pipe(Effect.map(disparityOf)),
        ),
        Then('the refusal names the missing charge and where the trace was written')((s) => {
          expect(s.refusal.relationId).toContain('credit.charge')
          expect(s.refusal.dumpPath).toContain('artifacts/traces/')
        }),
      ),
    )
  })
