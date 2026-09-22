import type { Graph } from '@systemfsoftware/trace-spec'
import { Edge, Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Schema as S } from 'effect'

export const TRACE_ID = 'trace-fixture-1'

export const SettleAttrs = S.Struct({
  'app.order.id': S.String,
  'app.order.total': S.Finite,
})

export const Settle = Span.declare({ id: 'fulfillment.settle', name: 'fulfillment.settle', attrs: SettleAttrs })

export const Charge = Span.declare({ id: 'credit.charge', name: 'credit.charge', attrs: SettleAttrs })

export const FulfillmentTaxonomy = Taxonomy.make({
  id: 'fulfillment',
  spans: [Settle, Charge],
  edges: [Edge.child(Settle, Charge)],
  forbid: [],
})

export interface RecordedSpan {
  readonly spanId: string
  readonly name: string
  readonly parentSpanId: string | null
  readonly status: Graph.Status
  readonly attributes: Readonly<Record<string, Span.AttributeValue>>
}

export const spanRecord = (recorded: RecordedSpan): Graph.SpanRecord => ({
  traceId: TRACE_ID,
  spanId: recorded.spanId,
  parentSpanId: recorded.parentSpanId,
  name: recorded.name,
  status: recorded.status,
  errorType: null,
  startMillis: 0,
  durationMillis: 4,
  attributes: new Map(Object.entries(recorded.attributes)),
  events: [],
  links: [],
})
