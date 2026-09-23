import { Context, type Effect } from 'effect'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { SpanRecord } from './Graph.js'

export { EmptyObservationError }

export interface Collector {
  readonly collect: (traceId: string) => Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
}

export class Observation extends Context.Service<Observation, Collector>()(
  '@systemfsoftware/trace-spec/Observation',
) {}
