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

const decodeBody = Schema.decodeEffect(Schema.fromJsonString(OtlpExportRequest))

const parseBody = (body: string, index: number) =>
  decodeBody(body).pipe(Effect.mapError((error) => `undecodable export body[${index}]: ${error.message}`))

const orEmpty = <A>(values: ReadonlyArray<A> | undefined): ReadonlyArray<A> => values ?? []

const spansOf = (request: OtlpExportRequest): ReadonlyArray<TraceGraph.SpanRecord> =>
  request.resourceSpans.flatMap((resource) => orEmpty(resource.scopeSpans).flatMap((scope) => orEmpty(scope.spans)))

const readFailure = <E extends { readonly message: string }>(error: E): string =>
  `the collector could not be read: ${error.message}`

/**
 * One read of the pushed bodies `bodies` yields, named `name` in a failure. The trace id is matched in lowercase,
 * the form pushed ids are normalised to.
 */
export const source = <E extends { readonly message: string }, R>(options: {
  readonly name: string
  readonly bodies: Effect.Effect<ReadonlyArray<string>, E, R>
}): TraceSource<R> =>
(traceId) =>
  options.bodies.pipe(
    Effect.mapError(readFailure),
    Effect.flatMap((bodies) => Effect.forEach(bodies, parseBody)),
    Effect.mapError((detail) => new TransportObservationError({ traceId, source: options.name, detail })),
    Effect.map((requests) => requests.flatMap(spansOf).filter((span) => span.traceId === traceId.toLowerCase())),
  )
