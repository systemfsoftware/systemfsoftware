import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { it } from '@systemfsoftware/vitest'
import { Effect, FileSystem, Layer } from 'effect'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const TraceSuite = Suite.make({ it })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const harness = Layer.merge(ObservationWindow.make('trace-spec').layer, discardingFileSystem)

type Order = { readonly orderId: string; readonly charge: boolean }

const settleOrder = (order: Order) => {
  const attrs = { 'app.order.id': order.orderId, 'app.order.total': 3 }
  const settled = Effect.succeed(`settled:${order.orderId}`)
  return Span.start(Settle, attrs)(order.charge ? Span.start(Charge, attrs)(settled) : settled)
}

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) => settleOrder(input),
})

const chargedSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(
    Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge), Rel.fromTaxonomy(FulfillmentTaxonomy, { path: 'allocate' })),
  )

const unchargedSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(Rel.all(Rel.exists(Settle), Rel.absent(Charge)))

TraceSuite('fulfillment.settle')
  .withScenarioLayer(harness)
  .body(({ Case }) => {
    Case('a charged settlement carries its charge beneath it', chargedSettlement, { orderId: 'order-21', charge: true })
    Case('an uncharged settlement carries no charge', unchargedSettlement, { orderId: 'order-22', charge: false })
  })
