import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  Contract,
  ContractDecodeError,
  EmptyObservationError,
  Observe,
  Rel,
  Stimulus,
  TraceDisparityError,
} from '@systemfsoftware/trace-spec'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { expect } from 'vitest'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it, layer })

type CheckFailure =
  | ContractDecodeError.ContractDecodeError
  | EmptyObservationError.EmptyObservationError
  | TraceDisparityError.TraceDisparityError

const disparityOf = (failure: CheckFailure): TraceDisparityError.TraceDisparityError => {
  if (!Schema.is(TraceDisparityError.TraceDisparityError)(failure)) {
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
  const settled = Effect.succeed(`settled:${order.orderId}`)
  const attrs = { 'app.order.id': order.orderId, 'app.order.total': 9 }
  return Settle.start(attrs)(order.charge ? Charge.start(attrs)(settled) : settled)
}

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) => settleOrder(input),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

Feature('Settling an order under a contract that names the charge')
  .withScenarioLayer(Layer.merge(Observe.inMemory, recordingFileSystem))
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
          expect(s.checked.graph.byId(Charge)).toHaveLength(1)
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
          (s) => Effect.flip(Contract.check(chargeBeneathSettlement, s.order)),
        ),
        Then('the refusal names the missing charge and where the trace was written')((s) => {
          const refusal = disparityOf(s.refusal)
          expect(refusal.relationId).toContain('credit.charge')
          expect(refusal.dumpPath).toContain('artifacts/traces/')
        }),
      ),
    )
  })
