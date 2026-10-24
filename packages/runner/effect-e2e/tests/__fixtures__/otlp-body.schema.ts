import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

const StringValue = Schema.Struct({ stringValue: Schema.String })
const IntValue = Schema.Struct({ intValue: Schema.Finite })
const DoubleValue = Schema.Struct({ doubleValue: Schema.Finite })
const BoolValue = Schema.Struct({ boolValue: Schema.Boolean })
const ArrayValue = Schema.Struct({ arrayValue: Schema.Struct({ values: Schema.Array(StringValue) }) })

const OtlpValue = Schema.Union([StringValue, IntValue, DoubleValue, BoolValue, ArrayValue])

export type ReceivedValue = string | number | boolean | ReadonlyArray<string>

const OtlpAttribute = Schema.Struct({ key: Schema.String, value: OtlpValue })
const OtlpAttributes = Schema.Array(OtlpAttribute)

const OtlpSpan = Schema.Struct({
  name: Schema.String,
  attributes: OtlpAttributes.pipe(Schema.optionalKey),
})

const TraceScope = Schema.Struct({
  spans: OtlpSpan.pipe(Schema.Array, Schema.optionalKey),
})

const TraceResource = Schema.Struct({
  scopeSpans: TraceScope.pipe(Schema.Array, Schema.optionalKey),
})

const TracesExport = Schema.Struct({
  resourceSpans: TraceResource.pipe(Schema.Array, Schema.optionalKey),
})

const NumberDataPoint = Schema.Struct({
  attributes: OtlpAttributes.pipe(Schema.optionalKey),
  asInt: Schema.Finite.pipe(Schema.optionalKey),
  asDouble: Schema.Finite.pipe(Schema.optionalKey),
})

const MetricSum = Schema.Struct({
  dataPoints: NumberDataPoint.pipe(Schema.Array, Schema.optionalKey),
})

const OtlpMetric = Schema.Struct({
  name: Schema.String,
  sum: MetricSum.pipe(Schema.optionalKey),
})

const MetricScope = Schema.Struct({
  metrics: OtlpMetric.pipe(Schema.Array, Schema.optionalKey),
})

const MetricResource = Schema.Struct({
  scopeMetrics: MetricScope.pipe(Schema.Array, Schema.optionalKey),
})

const MetricsExport = Schema.Struct({
  resourceMetrics: MetricResource.pipe(Schema.Array, Schema.optionalKey),
})

export interface ReceivedSpan {
  readonly name: string
  readonly attributes: Record<string, ReceivedValue>
}

export interface ReceivedMetricPoint {
  readonly attributes: Record<string, ReceivedValue>
  readonly value: number
}

export interface ReceivedMetric {
  readonly name: string
  readonly points: ReadonlyArray<ReceivedMetricPoint>
}

const valueOf = (value: Schema.Schema.Type<typeof OtlpValue>): ReceivedValue =>
  'stringValue' in value
    ? value.stringValue
    : 'intValue' in value
    ? value.intValue
    : 'doubleValue' in value
    ? value.doubleValue
    : 'boolValue' in value
    ? value.boolValue
    : value.arrayValue.values.map((each) => each.stringValue)

const projected = (
  attributes: ReadonlyArray<Schema.Schema.Type<typeof OtlpAttribute>>,
): Record<string, ReceivedValue> =>
  Object.fromEntries(attributes.map((attribute) => [attribute.key, valueOf(attribute.value)]))

export const spansOf = (body: string): Effect.Effect<ReadonlyArray<ReceivedSpan>, Schema.SchemaError> =>
  Effect.map(
    Schema.decodeUnknownEffect(TracesExport)(JSON.parse(body)),
    (decoded) =>
      (decoded.resourceSpans ?? []).flatMap((resource) =>
        (resource.scopeSpans ?? []).flatMap((scope) =>
          (scope.spans ?? []).map((span) => ({
            name: span.name,
            attributes: projected(span.attributes ?? []),
          }))
        )
      ),
  )

export const metricsOf = (body: string): Effect.Effect<ReadonlyArray<ReceivedMetric>, Schema.SchemaError> =>
  Effect.map(
    Schema.decodeUnknownEffect(MetricsExport)(JSON.parse(body)),
    (decoded) =>
      (decoded.resourceMetrics ?? []).flatMap((resource) =>
        (resource.scopeMetrics ?? []).flatMap((scope) =>
          (scope.metrics ?? []).map((metric) => ({
            name: metric.name,
            points: (metric.sum?.dataPoints ?? []).map((point) => ({
              attributes: projected(point.attributes ?? []),
              value: point.asDouble ?? point.asInt ?? 0,
            })),
          }))
        )
      ),
  )

export const totalIn =
  (metrics: ReadonlyArray<ReceivedMetric>) =>
  (name: string, dimensions: Readonly<Record<string, string>> = {}): number =>
    metrics
      .filter((metric) => metric.name === name)
      .flatMap((metric) => metric.points)
      .filter((point) => Object.entries(dimensions).every(([key, value]) => point.attributes[key] === value))
      .reduce((total, point) => total + point.value, 0)
