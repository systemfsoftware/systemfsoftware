import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import * as OtelResource from '@effect/opentelemetry/Resource'
import type { Attributes, AttributeValue as OtelAttributeValue } from '@opentelemetry/api'
import { SpanStatusCode } from '@opentelemetry/api'
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { Span } from '@systemfsoftware/trace-taxonomy'
import { Context, Effect, Layer } from 'effect'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { SpanEvent, SpanLink, SpanRecord, Status } from './Graph.js'

const SCALAR_TYPES: Record<string, true> = { string: true, number: true, boolean: true }

const isScalar = (value: unknown): value is string | number | boolean => SCALAR_TYPES[typeof value] === true

type OtelScalarArray = ReadonlyArray<string | number | boolean | null | undefined>

const scalarArrayOrNull = (value: OtelAttributeValue): Span.AttributeValue | null =>
  Array.isArray(value) ? (value satisfies OtelScalarArray).filter(isScalar) : null

const definedOrEmpty = (value: OtelAttributeValue | undefined): OtelAttributeValue => value ?? []

const attributeValue = (value: OtelAttributeValue | undefined): Span.AttributeValue | null =>
  isScalar(value) ? value : scalarArrayOrNull(definedOrEmpty(value))

const isPresent = (
  entry: readonly [string, Span.AttributeValue | null],
): entry is readonly [string, Span.AttributeValue] => entry[1] !== null

const attributeMap = (attributes: Attributes): ReadonlyMap<string, Span.AttributeValue> =>
  new Map(
    Object.entries(attributes)
      .map((entry): readonly [string, Span.AttributeValue | null] => [entry[0], attributeValue(entry[1])])
      .filter(isPresent),
  )

const STATUS_BY_CODE: Record<number, Status> = {
  [SpanStatusCode.OK]: 'ok',
  [SpanStatusCode.ERROR]: 'error',
  [SpanStatusCode.UNSET]: 'unset',
}

const statusOf = (code: SpanStatusCode): Status => STATUS_BY_CODE[code] ?? 'unset'

const errorTypeOf = (attributes: ReadonlyMap<string, Span.AttributeValue>): string | null => {
  const value = attributes.get('error.type')
  return typeof value === 'string' ? value : null
}

const parentOf = (span: ReadableSpan): string | null => {
  const parent = span.parentSpanContext
  return parent === undefined ? null : parent.spanId
}

const eventsOf = (span: ReadableSpan): ReadonlyArray<SpanEvent> =>
  span.events.map((event): SpanEvent => ({ name: event.name, attributes: attributeMap(event.attributes ?? {}) }))

const linksOf = (span: ReadableSpan): ReadonlyArray<SpanLink> =>
  span.links.map((link): SpanLink => ({ traceId: link.context.traceId, spanId: link.context.spanId }))

const millisOf = (duration: readonly [number, number]): number => duration[0] * 1_000 + duration[1] / 1_000_000

export const spanRecordOf = (span: ReadableSpan): SpanRecord => {
  const attributes = attributeMap(span.attributes)
  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: parentOf(span),
    name: span.name,
    status: statusOf(span.status.code),
    errorType: errorTypeOf(attributes),
    startMillis: millisOf(span.startTime),
    durationMillis: millisOf(span.duration),
    attributes,
    events: eventsOf(span),
    links: linksOf(span),
  }
}

export interface Collector {
  readonly collect: (traceId: string) => Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
}

export class Observation extends Context.Service<Observation, Collector>()(
  '@systemfsoftware/trace-spec/Observation',
) {}

interface Sink {
  readonly exporter: InMemorySpanExporter
  readonly provider: BasicTracerProvider
}

const makeSink = (): Sink => {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  return { exporter, provider }
}

const emptyObservation = (traceId: string): EmptyObservationError =>
  new EmptyObservationError({
    traceId,
    detail: 'the observation window closed with no span carrying the stimulated trace id',
  })

const collectorOf = (exporter: InMemorySpanExporter): Collector => ({
  collect: (traceId) =>
    Effect.suspend(() => {
      const records = exporter.getFinishedSpans()
        .filter((span) => span.spanContext().traceId === traceId)
        .map(spanRecordOf)
      return records.length > 0 ? Effect.succeed(records) : Effect.fail(emptyObservation(traceId))
    }),
})

const acquireSink = Effect.acquireRelease(
  Effect.sync(makeSink),
  (sink) => Effect.promise(() => sink.provider.shutdown()),
)

const sinkLayer = Layer.effectContext(
  Effect.map(acquireSink, (sink) =>
    Context.make(Observation, collectorOf(sink.exporter)).pipe(
      Context.add(OtelTracer.OtelTracerProvider, sink.provider),
    )),
)

export const inMemory: Layer.Layer<Observation | OtelTracer.OtelTracer> = OtelTracer.layer.pipe(
  Layer.provide(OtelResource.layer({ serviceName: 'trace-spec' })),
  Layer.provideMerge(sinkLayer),
)
