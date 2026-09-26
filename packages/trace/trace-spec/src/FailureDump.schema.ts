import type { Span } from '@systemfsoftware/trace-taxonomy'
import { Schema } from 'effect'
import { dual } from 'effect/Function'
import { SpanRecord } from './TraceGraph.schema.js'

export const Observed = Schema.Struct({
  traceId: Schema.String,
  spans: Schema.Array(SpanRecord),
})
export type Observed = typeof Observed.Type

const renderValue = (value: Span.AttributeValue): string => JSON.stringify(value)

const renderEntries = (entries: Iterable<readonly [string, Span.AttributeValue]>): string =>
  [...entries].map(([key, value]) => `${key}=${renderValue(value)}`).join(' ')

const indentOf = (depth: number): string => '  '.repeat(depth)

const childrenOf = (spans: ReadonlyArray<SpanRecord>, spanId: string): ReadonlyArray<SpanRecord> =>
  spans.filter((span) => span.parentSpanId === spanId)

const renderNode = (spans: ReadonlyArray<SpanRecord>, node: SpanRecord, depth: number): string => {
  const head = `${indentOf(depth)}${node.name} (${node.spanId}) status=${node.status} error.type=${
    String(node.errorType)
  } duration=${node.durationMillis}ms`
  const tail = [
    `${indentOf(depth)}  attrs: ${renderEntries(Object.entries(node.attributes))}`,
    ...node.events.map((event) =>
      `${indentOf(depth)}  event ${event.name} ${renderEntries(Object.entries(event.attributes))}`
    ),
    ...node.links.map((link) => `${indentOf(depth)}  link ${link.traceId}/${link.spanId}`),
    ...childrenOf(spans, node.spanId).map((child) => renderNode(spans, child, depth + 1)),
  ]
  return [head, ...tail].join('\n')
}

const documentImpl = (observed: Observed, report: string): string =>
  [`trace ${observed.traceId}`, report, ...observed.spans.map((node) => renderNode(observed.spans, node, 0))].join(
    '\n',
  )
export const document: {
  (report: string): (observed: Observed) => string
  (observed: Observed, report: string): string
} = dual(2, documentImpl)
