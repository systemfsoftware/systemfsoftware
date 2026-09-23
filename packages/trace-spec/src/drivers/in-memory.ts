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
import { Context, Effect, Layer, Predicate } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as Scope from 'effect/Scope'
import { EmptyObservationError } from '../EmptyObservationError.schema.js'
import type { SpanEvent, SpanLink, SpanRecord, Status } from '../graph.schema.js'
import { type Collector, Observation } from '../Observation.service.js'

const SpecTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/InMemory')
export type SpecTypeId = typeof SpecTypeId

const SinkTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/InMemory/Sink')
export type SinkTypeId = typeof SinkTypeId

const ExporterId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/InMemory/exporter')

const ProviderId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/InMemory/provider')

/**
 * The cold specification of an in-memory observation window: immutable data naming the
 * service the exported resource carries. Acquiring it is {@link scoped}; binding it as a
 * service is {@link layer}.
 */
export interface Spec extends Pipeable {
  readonly [SpecTypeId]: SpecTypeId
  readonly serviceName: string
}

/**
 * The live observation window held while its scope stays open. The OpenTelemetry exporter
 * and tracer provider travel in private symbol slots: consumers read a trace through
 * {@link collect} or the `Observation` port, never through the SDK objects.
 */
export interface Sink extends Pipeable {
  readonly [SinkTypeId]: SinkTypeId
  readonly [ExporterId]: InMemorySpanExporter
  readonly [ProviderId]: BasicTracerProvider
}

export const isSpec = (value: unknown): value is Spec => Predicate.hasProperty(value, SpecTypeId)

export const isSink = (value: unknown): value is Sink => Predicate.hasProperty(value, SinkTypeId)

const DEFAULT_SERVICE_NAME = 'trace-spec'

export interface MakeOptions {
  readonly serviceName?: string | undefined
}

const namedServiceOf = (options: MakeOptions): string => options.serviceName ?? DEFAULT_SERVICE_NAME

const serviceNameOf = (options: MakeOptions | undefined): string =>
  options === undefined ? DEFAULT_SERVICE_NAME : namedServiceOf(options)

export const make = (options?: MakeOptions): Spec => ({
  [SpecTypeId]: SpecTypeId,
  serviceName: serviceNameOf(options),
  ...Prototype,
})

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

const attributeRecordOf = (attributes: Attributes): Record<string, Span.AttributeValue> =>
  Object.fromEntries(
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

const errorTypeOf = (attributes: Record<string, Span.AttributeValue>): string | null => {
  const value = attributes['error.type']
  return typeof value === 'string' ? value : null
}

const parentOf = (span: ReadableSpan): string | null => {
  const parent = span.parentSpanContext
  return parent === undefined ? null : parent.spanId
}

const eventsOf = (span: ReadableSpan): ReadonlyArray<SpanEvent> =>
  span.events.map((event): SpanEvent => ({ name: event.name, attributes: attributeRecordOf(event.attributes ?? {}) }))

const linksOf = (span: ReadableSpan): ReadonlyArray<SpanLink> =>
  span.links.map((link): SpanLink => ({ traceId: link.context.traceId, spanId: link.context.spanId }))

const millisOf = (duration: readonly [number, number]): number => duration[0] * 1_000 + duration[1] / 1_000_000

const spanRecordOf = (span: ReadableSpan): SpanRecord => {
  const attributes = attributeRecordOf(span.attributes)
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

const makeSink = (): Sink => {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  return { [SinkTypeId]: SinkTypeId, [ExporterId]: exporter, [ProviderId]: provider, ...Prototype }
}

const shutdownSink = (sink: Sink): Effect.Effect<void> => Effect.promise(() => sink[ProviderId].shutdown())

/**
 * Acquires the live observation window for one scope: the exporter and its tracer provider
 * come up together and the provider shuts down when the scope closes. Two acquisitions own
 * two windows — no span recorded in one is visible to the other.
 */
export const scoped = (_spec: Spec): Effect.Effect<Sink, never, Scope.Scope> =>
  Effect.acquireRelease(Effect.sync(makeSink), shutdownSink)

/**
 * Reads the recorded spans of one trace from a window, refusing with
 * {@link EmptyObservationError} when the window closed with nothing on that trace.
 */
export const collect: {
  (traceId: string): (self: Sink) => Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
  (self: Sink, traceId: string): Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
} = dual(2, (self: Sink, traceId: string) => collectorOf(self[ExporterId]).collect(traceId))

const sinkContext = (
  spec: Spec,
): Effect.Effect<Context.Context<Observation | OtelTracer.OtelTracerProvider>, never, Scope.Scope> =>
  Effect.map(scoped(spec), (sink) =>
    Context.make(Observation, collectorOf(sink[ExporterId])).pipe(
      Context.add(OtelTracer.OtelTracerProvider, sink[ProviderId]),
    ))

/**
 * Binds the window's services: `Observation` for reading a trace back, and the Effect
 * tracer the stimulus runs under, with the resource named after the spec's service name.
 * The provider shuts down when the layer's scope closes.
 */
export const layer = (spec: Spec): Layer.Layer<Observation | OtelTracer.OtelTracer> =>
  OtelTracer.layer.pipe(
    Layer.provideMerge(OtelResource.layer({ serviceName: spec.serviceName })),
    Layer.provideMerge(Layer.effectContext(sinkContext(spec))),
  )
