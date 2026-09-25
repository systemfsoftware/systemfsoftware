import { Context, type Effect } from 'effect'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { SpanRecord } from './Graph.js'
import { IncompleteObservationError } from './IncompleteObservationError.schema.js'
import { TransportObservationError } from './TransportObservationError.schema.js'

export { EmptyObservationError, IncompleteObservationError, TransportObservationError }

export type ObservationFailure = EmptyObservationError | IncompleteObservationError | TransportObservationError

export interface Collector {
  readonly collect: (traceId: string) => Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure>
}

export class Observation extends Context.Service<Observation, Collector>()(
  '@systemfsoftware/trace-spec/Observation',
) {}
