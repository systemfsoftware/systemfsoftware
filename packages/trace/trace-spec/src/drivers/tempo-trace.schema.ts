import { Encoding, Schema, SchemaGetter, SchemaTransformation } from 'effect'
import * as TraceGraph from '../TraceGraph.schema.js'

/**
 * The wire Grafana Tempo answers `GET /api/v2/traces/<id>` with: the OTLP
 * resource spans of one trace under a `trace` key, beside the store's
 * completeness `status` and `message`. gogo jsonpb omits zero-valued fields,
 * so ids arrive as base64 proto bytes, times as nanosecond strings, int
 * attribute values as strings, an unset span status as an empty or absent
 * `status` object, and a complete answer carries no `status` at all.
 * Everything except the trace id, span id, name, and the two times is
 * optional with a default. Attribute values the span record cannot carry
 * (kvlists, byte strings, non-scalar array members) are dropped, the rule
 * the observation window applies to its own spans.
 */

interface WireAnyValue {
  readonly stringValue?: string | undefined
  readonly boolValue?: boolean | undefined
  readonly intValue?: string | undefined
  readonly doubleValue?: number | undefined
  readonly arrayValue?: { readonly values?: ReadonlyArray<WireAnyValue> | undefined } | undefined
}

interface WireAttribute {
  readonly key: string
  readonly value?: WireAnyValue | undefined
}

type StatusCode = 'STATUS_CODE_UNSET' | 'STATUS_CODE_OK' | 'STATUS_CODE_ERROR'

interface WireStatus {
  readonly message?: string | undefined
  readonly code?: StatusCode | undefined
}

interface WireEvent {
  readonly name: string
  readonly timeUnixNano?: number | undefined
  readonly attributes?: ReadonlyArray<WireAttribute> | undefined
}

interface WireLink {
  readonly traceId?: string | undefined
  readonly spanId?: string | undefined
}

interface WireSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string | undefined
  readonly name: string
  readonly kind?: string | undefined
  readonly startTimeUnixNano: number
  readonly endTimeUnixNano: number
  readonly attributes?: ReadonlyArray<WireAttribute> | undefined
  readonly events?: ReadonlyArray<WireEvent> | undefined
  readonly links?: ReadonlyArray<WireLink> | undefined
  readonly status?: WireStatus | undefined
  readonly traceState?: string | undefined
  readonly flags?: number | undefined
}

/** Proto bytes (base64 on the wire) as the lowercase hex ids traces are addressed by. */
export const HexId = Schema.Uint8ArrayFromBase64.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform(Encoding.encodeHex),
    encode: SchemaGetter.decodeHex(),
  }),
)

const secondsAndNanos = (nanos: string): readonly [number, number] => {
  const text = nanos.padStart(10, '0')
  return [Number(text.slice(0, -9)), Number(text.slice(-9))]
}

const millisOf = (nanos: string): number => {
  const [seconds, subMillis] = secondsAndNanos(nanos)
  return seconds * 1_000 + subMillis / 1_000_000
}

const MillisFromNanos = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Finite,
    SchemaTransformation.transform({
      decode: millisOf,
      encode: (millis) => String(Math.round(millis * 1_000_000)),
    }),
  ),
)

const unsetParent = (parent: string): boolean => parent === '' || /^0+$/.test(parent)

const heldParent = (parent: string): string | null => (unsetParent(parent) ? null : parent)

const parentOf = (parent: string | undefined): string | null => heldParent(parent ?? '')

const EMPTY_STATUS: WireStatus = {}

const codeOf = (status: WireStatus): StatusCode => status.code ?? 'STATUS_CODE_UNSET'

const STATUS_BY_CODE: Record<StatusCode, TraceGraph.Status> = {
  STATUS_CODE_UNSET: 'unset',
  STATUS_CODE_OK: 'ok',
  STATUS_CODE_ERROR: 'error',
}

const statusOf = (status: WireStatus | undefined): TraceGraph.Status => STATUS_BY_CODE[codeOf(status ?? EMPTY_STATUS)]

const stringValueOf = (value: WireAnyValue): TraceGraph.AttributeValue | null => value.stringValue ?? null

const numberOf = (value: WireAnyValue): TraceGraph.AttributeValue | null =>
  value.doubleValue ?? intToNumber(value.intValue)

const intToNumber = (text: string | undefined): number | null => (text === undefined ? null : Number(text))

const boolOrNumberOf = (value: WireAnyValue): TraceGraph.AttributeValue | null => value.boolValue ?? numberOf(value)

const scalarOf = (value: WireAnyValue): TraceGraph.AttributeValue | null =>
  stringValueOf(value) ?? boolOrNumberOf(value)

const isScalarMember = (member: TraceGraph.AttributeValue | null): member is string | number | boolean =>
  member !== null

const arrayValuesOf = (value: WireAnyValue): ReadonlyArray<WireAnyValue> | undefined => value.arrayValue?.values

const scalarMembersOf = (values: ReadonlyArray<WireAnyValue>): TraceGraph.AttributeValue =>
  values.map(scalarOf).filter(isScalarMember)

const arrayValueOf = (values: ReadonlyArray<WireAnyValue> | undefined): TraceGraph.AttributeValue | null =>
  values === undefined ? null : scalarMembersOf(values)

const presentValueOf = (value: WireAnyValue): TraceGraph.AttributeValue | null =>
  scalarOf(value) ?? arrayValueOf(arrayValuesOf(value))

type AttributeEntry = readonly [string, TraceGraph.AttributeValue | null]

const isPresent = (entry: AttributeEntry): entry is readonly [string, TraceGraph.AttributeValue] => entry[1] !== null

const entryOf = (attribute: WireAttribute): AttributeEntry => [attribute.key, attributeValueOf(attribute.value)]

const attributeValueOf = (value: WireAnyValue | undefined): TraceGraph.AttributeValue | null =>
  value === undefined ? null : presentValueOf(value)

const attributesOf = (attributes: ReadonlyArray<WireAttribute> | undefined): TraceGraph.Attributes =>
  Object.fromEntries((attributes ?? []).map(entryOf).filter(isPresent))

const errorTypeOf = (attributes: TraceGraph.Attributes): string | null => {
  const value = attributes['error.type']
  return typeof value === 'string' ? value : null
}

const eventOf = (event: WireEvent): TraceGraph.SpanEvent => ({
  name: event.name,
  attributes: attributesOf(event.attributes),
})

const linkIdOf = (id: string | undefined): string => id ?? ''

const linkOf = (link: WireLink): TraceGraph.SpanLink => ({
  traceId: linkIdOf(link.traceId),
  spanId: linkIdOf(link.spanId),
})

const eventsOf = (span: WireSpan): ReadonlyArray<TraceGraph.SpanEvent> => (span.events ?? []).map(eventOf)

const linksOf = (span: WireSpan): ReadonlyArray<TraceGraph.SpanLink> => (span.links ?? []).map(linkOf)

const spanRecordOf = (span: WireSpan): TraceGraph.SpanRecord => {
  const attributes = attributesOf(span.attributes)
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: parentOf(span.parentSpanId),
    name: span.name,
    status: statusOf(span.status),
    errorType: errorTypeOf(attributes),
    startMillis: span.startTimeUnixNano,
    durationMillis: span.endTimeUnixNano - span.startTimeUnixNano,
    attributes,
    events: eventsOf(span),
    links: linksOf(span),
  }
}

const wireTextOf = (value: TraceGraph.AttributeValue): WireAnyValue | undefined =>
  typeof value === 'string' ? { stringValue: value } : undefined

const wireBoolOf = (value: TraceGraph.AttributeValue): WireAnyValue | undefined =>
  typeof value === 'boolean' ? { boolValue: value } : undefined

const isValueArray = (value: TraceGraph.AttributeValue): value is ReadonlyArray<string | number | boolean> =>
  Array.isArray(value)

const wireArrayOf = (value: TraceGraph.AttributeValue): WireAnyValue => ({
  arrayValue: { values: isValueArray(value) ? value.map(wireValueOf) : [] },
})

const wireNumberOrArrayOf = (value: TraceGraph.AttributeValue): WireAnyValue =>
  typeof value === 'number' ? { doubleValue: value } : wireArrayOf(value)

const wireBoolOrNumberOf = (value: TraceGraph.AttributeValue): WireAnyValue =>
  wireBoolOf(value) ?? wireNumberOrArrayOf(value)

const wireValueOf = (value: TraceGraph.AttributeValue): WireAnyValue => wireTextOf(value) ?? wireBoolOrNumberOf(value)

const wireAttributesOf = (attributes: TraceGraph.Attributes): ReadonlyArray<WireAttribute> =>
  Object.entries(attributes).map(([key, value]) => ({ key, value: wireValueOf(value) }))

const STATUS_CODE_BY_STATUS: Record<TraceGraph.Status, StatusCode> = {
  unset: 'STATUS_CODE_UNSET',
  ok: 'STATUS_CODE_OK',
  error: 'STATUS_CODE_ERROR',
}

const wireStatusOf = (status: TraceGraph.Status): WireStatus => ({ code: STATUS_CODE_BY_STATUS[status] })

const wireSpanOf = (record: TraceGraph.SpanRecord): WireSpan => ({
  traceId: record.traceId,
  spanId: record.spanId,
  parentSpanId: record.parentSpanId ?? undefined,
  name: record.name,
  startTimeUnixNano: record.startMillis,
  endTimeUnixNano: record.startMillis + record.durationMillis,
  attributes: wireAttributesOf(record.attributes),
  events: record.events.map((event) => ({ name: event.name, attributes: wireAttributesOf(event.attributes) })),
  links: record.links.map((link) => ({ traceId: link.traceId, spanId: link.spanId })),
  status: wireStatusOf(record.status),
})

const WireAnyValue = Schema.Struct({
  stringValue: Schema.optional(Schema.String),
  boolValue: Schema.optional(Schema.Boolean),
  intValue: Schema.optional(Schema.String),
  doubleValue: Schema.optional(Schema.Finite),
  arrayValue: Schema.optional(
    Schema.Struct({
      values: Schema.optional(Schema.Array(Schema.suspend((): Schema.Codec<WireAnyValue> => WireAnyValue))),
    }),
  ),
})

const WireAttribute = Schema.Struct({
  key: Schema.String,
  value: Schema.optional(WireAnyValue),
})

const WireStatus = Schema.Struct({
  message: Schema.optional(Schema.String),
  code: Schema.optional(Schema.Literals(['STATUS_CODE_UNSET', 'STATUS_CODE_OK', 'STATUS_CODE_ERROR'])),
})

const WireEvent = Schema.Struct({
  name: Schema.String,
  timeUnixNano: Schema.optional(MillisFromNanos),
  attributes: Schema.optional(Schema.Array(WireAttribute)),
})

const WireLink = Schema.Struct({
  traceId: Schema.optional(HexId),
  spanId: Schema.optional(HexId),
})

const WireSpan = Schema.Struct({
  traceId: HexId,
  spanId: HexId,
  parentSpanId: Schema.optional(HexId),
  name: Schema.String,
  kind: Schema.optional(Schema.String),
  startTimeUnixNano: MillisFromNanos,
  endTimeUnixNano: MillisFromNanos,
  attributes: Schema.optional(Schema.Array(WireAttribute)),
  events: Schema.optional(Schema.Array(WireEvent)),
  links: Schema.optional(Schema.Array(WireLink)),
  status: Schema.optional(WireStatus),
  traceState: Schema.optional(Schema.String),
  flags: Schema.optional(Schema.Finite),
}).pipe(
  Schema.decodeTo(
    TraceGraph.SpanRecord,
    SchemaTransformation.transform({
      decode: spanRecordOf,
      encode: wireSpanOf,
    }),
  ),
)

const WireScopeSpans = Schema.Struct({
  spans: Schema.optional(Schema.Array(WireSpan)),
})

const WireResourceSpans = Schema.Struct({
  scopeSpans: Schema.optional(Schema.Array(WireScopeSpans)),
})
export type WireResourceSpans = typeof WireResourceSpans.Type
export type WireScopeSpans = typeof WireScopeSpans.Type

/** One trace-by-id answer: the spans, plus the store's completeness status when it is not complete. */
export const TempoV2TraceResponse = Schema.Struct({
  trace: Schema.Struct({ resourceSpans: Schema.optional(Schema.Array(WireResourceSpans)) }),
  status: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})
export type TempoV2TraceResponse = typeof TempoV2TraceResponse.Type
