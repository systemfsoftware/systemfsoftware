import { Schema } from 'effect'

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

export const SpanRecord = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  status: Status,
  errorType: Schema.NullOr(Schema.String),
  startMillis: Schema.Finite,
  durationMillis: Schema.Finite,
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
  startMillis: Schema.Finite,
  durationMillis: Schema.Finite,
  attrs: Attributes,
  events: Schema.Array(SpanEvent),
  links: Schema.Array(SpanLink),
})
export type GraphNode = typeof GraphNode.Type

export const TraceGraph = Schema.Struct({ traceId: Schema.String, nodes: Schema.Array(GraphNode) })
export type TraceGraph = typeof TraceGraph.Type
