import { it, layer } from '@effect/vitest'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer } from 'effect'
import { Charge, FulfillmentTaxonomy, Settle } from './fulfillment-trace.schema.js'

const TraceSuite = Suite.make({ it, layer })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const settleWithoutCharge = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: string }) =>
    Span.start(Settle, { 'app.order.id': input, 'app.order.total': 1 })(Effect.succeed(`settled:${input}`)),
})

const chargeMustFollow = Contract.of(FulfillmentTaxonomy)
  .stimulate(settleWithoutCharge)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

TraceSuite('annotation failure fixture')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, discardingFileSystem))
  .body(({ Case }) => {
    Case('a settlement without its charge breaks the relation', chargeMustFollow, 'order-9')
  })
