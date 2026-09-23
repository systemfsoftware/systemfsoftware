import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
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
import { Context, Effect, Predicate } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import { Observation } from './Observation.service.js'
import type { ObservationWindowSpec } from './ObservationWindowSpec.schema.js'
import type { SpanEvent, SpanLink, SpanRecord, Status } from './TraceGraph.schema.js'

export const TypeId = Symbol.for('~systemfsoftware/trace-spec/ObservationWindow')
export type TypeId = typeof TypeId

const ExporterId: unique symbol = Symbol.for('~systemfsoftware/trace-spec/ObservationWindow/exporter')

const ProviderId: unique symbol = Symbol.for('~systemfsoftware/trace-spec/ObservationWindow/provider')

export interface ObservationWindow extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [ExporterId]: InMemorySpanExporter
  readonly [ProviderId]: BasicTracerProvider
  readonly serviceName: string
}

export const isObservationWindow = (u: unknown): u is ObservationWindow => Predicate.hasProperty(u, TypeId)

export const make = (spec: ObservationWindowSpec): ObservationWindow => {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  return {
    [TypeId]: TypeId,
    [ExporterId]: exporter,
    [ProviderId]: provider,
    serviceName: spec.serviceName,
    ...Prototype,
  }
}

export const shutdown = (self: ObservationWindow): Effect.Effect<void> =>
  Effect.promise(() => self[ProviderId].shutdown())

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

const recordsOf = (self: ObservationWindow, traceId: string): ReadonlyArray<SpanRecord> =>
  self[ExporterId].getFinishedSpans()
    .filter((span) => span.spanContext().traceId === traceId)
    .map(spanRecordOf)

export const collect: {
  (traceId: string): (self: ObservationWindow) => Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
  (self: ObservationWindow, traceId: string): Effect.Effect<ReadonlyArray<SpanRecord>, EmptyObservationError>
} = dual(2, (self: ObservationWindow, traceId: string) =>
  Effect.suspend(() => {
    const records = recordsOf(self, traceId)
    return records.length > 0 ? Effect.succeed(records) : Effect.fail(emptyObservation(traceId))
  }))

export const context = (self: ObservationWindow): Context.Context<Observation | OtelTracer.OtelTracerProvider> =>
  Context.make(Observation, { collect: (traceId) => collect(self, traceId) }).pipe(
    Context.add(OtelTracer.OtelTracerProvider, self[ProviderId]),
  )
