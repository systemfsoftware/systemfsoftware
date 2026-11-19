import { Effect, Schema } from 'effect'
import type { TraceSource } from './RemoteObservation.js'
import { OtlpExportRequest } from './tempo-trace.schema.js'
import type * as TraceGraph from './TraceGraph.schema.js'
import { TransportObservationError } from './TransportObservationError.schema.js'

/**
 * The OTLP push trace source: the spans of one trace among the JSON bodies an
 * OTLP/HTTP exporter pushed to a collector the caller runs, such as a loopback
 * server in a test. Every body is read on every call, so spans pushed in
 * several batches all count. A body that is not an OTLP JSON export request
 * fails with the transport failure, since waiting cannot make it readable.
 */

const parseBody = Schema.decodeEffect(Schema.fromJsonString(OtlpExportRequest))

const orEmpty = <A>(values: ReadonlyArray<A> | undefined): ReadonlyArray<A> => values ?? []

const spansOf = (request: OtlpExportRequest): ReadonlyArray<TraceGraph.SpanRecord> =>
  orEmpty(request.resourceSpans).flatMap((resource) =>
    orEmpty(resource.scopeSpans).flatMap((scope) => orEmpty(scope.spans))
  )

/** One read of the pushed bodies `bodies` yields, named `name` in a failure. */
export const source = <R>(options: {
  readonly name: string
  readonly bodies: Effect.Effect<ReadonlyArray<string>, never, R>
}): TraceSource<R> =>
(traceId) =>
  options.bodies.pipe(
    Effect.flatMap((bodies) => Effect.forEach(bodies, (body) => parseBody(body))),
    Effect.mapError((error) =>
      new TransportObservationError({
        traceId,
        source: options.name,
        detail: `undecodable export body: ${error.message}`,
      })
    ),
    Effect.map((requests) => requests.flatMap(spansOf).filter((span) => span.traceId === traceId)),
  )
