import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const Status = Schema.Literals(['ok', 'unset', 'error'])
export type Status = typeof Status.Type

export const AttributeValue = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Boolean,
  Schema.Array(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
])
export type AttributeValue = typeof AttributeValue.Type

export const Attributes = Schema.Record(Schema.String, AttributeValue)
export type Attributes = typeof Attributes.Type

export const SpanEvent = Schema.Struct({ name: Schema.String, attributes: Attributes })
export type SpanEvent = typeof SpanEvent.Type

export const SpanLink = Schema.Struct({ traceId: Schema.String, spanId: Schema.String })
export type SpanLink = typeof SpanLink.Type

const SpanMillis = Schema.Finite.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

export const SpanRecord = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  status: Status,
  errorType: Schema.NullOr(Schema.String),
  startMillis: SpanMillis,
  durationMillis: SpanMillis,
  attributes: Attributes,
  events: Schema.Array(SpanEvent),
  links: Schema.Array(SpanLink),
})
export type SpanRecord = typeof SpanRecord.Type

export const GraphNode = Schema.Struct({
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  status: Status,
  errorType: Schema.NullOr(Schema.String),
  startMillis: SpanMillis,
  durationMillis: SpanMillis,
  attrs: Attributes,
  events: Schema.Array(SpanEvent),
  links: Schema.Array(SpanLink),
})
export type GraphNode = typeof GraphNode.Type

export const TraceGraph = Schema.Struct({ traceId: Schema.String, nodes: Schema.Array(GraphNode) })
export type TraceGraph = typeof TraceGraph.Type

const spanMillisSeeds = [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

const nonNegativeFinite = (value: number): boolean => Number.isFinite(value) && value >= 0
const spanMillisDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(SpanMillis)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_SpanMillisRefusal_≡NonNegative',
    { of: [Schema.Finite], subject: spanMillisDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(spanMillisSeeds, value),
        (candidate) => subject(candidate) === nonNegativeFinite(candidate),
      ),
  )
}
