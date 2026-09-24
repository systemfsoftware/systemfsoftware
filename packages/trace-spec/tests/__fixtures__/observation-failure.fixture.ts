import { it } from '@effect/vitest'
import { Contract, Observation, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer } from 'effect'
import { FulfillmentTaxonomy, Settle } from './fulfillment-trace.schema.js'

const TraceSuite = Suite.make({ it })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const settle = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: string }) =>
    Span.start(Settle, { 'app.order.id': input, 'app.order.total': 1 })(Effect.succeed(`settled:${input}`)),
})

const settlementExists = Contract.of(FulfillmentTaxonomy).stimulate(settle).holds(Rel.exists(Settle))

const unreachableStore = Layer.succeed(Observation.Observation, {
  collect: (traceId) =>
    Effect.fail(
      new Observation.TransportObservationError({
        traceId,
        source: 'http://tempo.invalid/api/v2/traces',
        detail: 'connection refused',
      }),
    ),
})

const unfinishedStore = Layer.succeed(Observation.Observation, {
  collect: (traceId) =>
    Effect.fail(
      new Observation.IncompleteObservationError({ traceId, spanCount: 3, detail: 'span set still growing' }),
    ),
})

TraceSuite('a store that cannot be read')
  .withScenarioLayer(Layer.merge(unreachableStore, discardingFileSystem))
  .body(({ Case }) => {
    Case('a settlement judged while the store is unreachable', settlementExists, 'order-1')
  })

TraceSuite('a store still receiving the trace')
  .withScenarioLayer(Layer.merge(unfinishedStore, discardingFileSystem))
  .body(({ Case }) => {
    Case('a settlement read back before its spans stopped arriving', settlementExists, 'order-2')
  })
