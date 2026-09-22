/// <reference types="vitest/importMeta" />
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, Match, Result, Schema, type SchemaIssue } from 'effect'
import { ContractDecodeError } from './ContractDecodeError.schema.js'

export type Status = 'ok' | 'unset' | 'error'

export interface SpanEvent {
  readonly name: string
  readonly attributes: ReadonlyMap<string, Span.AttributeValue>
}

export interface SpanLink {
  readonly traceId: string
  readonly spanId: string
}

export interface SpanRecord {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string | null
  readonly name: string
  readonly status: Status
  readonly errorType: string | null
  readonly startMillis: number
  readonly durationMillis: number
  readonly attributes: ReadonlyMap<string, Span.AttributeValue>
  readonly events: ReadonlyArray<SpanEvent>
  readonly links: ReadonlyArray<SpanLink>
}

export interface Node<Attrs extends Span.AttributeRecord> {
  readonly spanId: string
  readonly parentSpanId: string | null
  readonly name: string
  readonly status: Status
  readonly errorType: string | null
  readonly startMillis: number
  readonly durationMillis: number
  readonly attrs: Attrs
  readonly events: ReadonlyArray<SpanEvent>
  readonly links: ReadonlyArray<SpanLink>
}

export type GraphNode = Node<Span.AttributeRecord>

export interface TraceGraph {
  readonly traceId: string
  readonly nodes: ReadonlyArray<GraphNode>
  readonly byId: (spec: Span.Span) => ReadonlyArray<GraphNode>
  readonly children: (node: GraphNode) => ReadonlyArray<GraphNode>
  readonly descendants: (node: GraphNode) => ReadonlyArray<GraphNode>
}

const plainAttributes = (
  attributes: ReadonlyMap<string, Span.AttributeValue>,
): Record<string, Span.AttributeValue> => Object.fromEntries(attributes)

const indexDeclarations = (taxonomy: Taxonomy.Taxonomy): ReadonlyMap<string, Span.Span> =>
  new Map(taxonomy.spans.map((span): readonly [string, Span.Span] => [span.name, span]))

const keyOfPath = (path: ReadonlyArray<PropertyKey>): string | null => {
  const last = path.at(-1)
  return last === undefined ? null : String(last)
}

const pointerAttributeName = (pointer: SchemaIssue.Pointer): string | null =>
  keyOfPath(pointer.path) ?? attributeNameOf(pointer.issue)

const filterAttributeName = (filter: SchemaIssue.Filter): string | null => attributeNameOf(filter.issue)

const encodingAttributeName = (encoding: SchemaIssue.Encoding): string | null => attributeNameOf(encoding.issue)

const compositeAttributeName = (composite: SchemaIssue.Composite): string | null => firstAttributeName(composite.issues)

const anyOfAttributeName = (anyOf: SchemaIssue.AnyOf): string | null => firstAttributeName(anyOf.issues)

const noAttributeName = (): null => null

const attributeNameOf = (issue: SchemaIssue.Issue): string | null =>
  Match.value(issue).pipe(
    Match.tag('Pointer', pointerAttributeName),
    Match.tag('Filter', filterAttributeName),
    Match.tag('Encoding', encodingAttributeName),
    Match.tag('Composite', compositeAttributeName),
    Match.tag('AnyOf', anyOfAttributeName),
    Match.orElse(noAttributeName),
  )

const firstAttributeName = (issues: ReadonlyArray<SchemaIssue.Issue>): string | null =>
  issues.map(attributeNameOf).find((name) => name !== null) ?? null

const decodeFailure = (
  spec: Span.Span,
  record: SpanRecord,
  detail: string,
  attribute: string | null,
): ContractDecodeError =>
  ContractDecodeError.make({
    declarationId: spec.id,
    spanName: record.name,
    spanId: record.spanId,
    attribute: attribute ?? '*',
    detail,
  })

const decodeAttrs = (
  spec: Span.Span,
  record: SpanRecord,
): Result.Result<Span.AttributeRecord, ContractDecodeError> =>
  Result.mapError(
    Schema.decodeResult(Schema.toType(spec.attrs))(plainAttributes(record.attributes)),
    (error) => decodeFailure(spec, record, error.message, attributeNameOf(error.issue)),
  )

const nodeOf = (record: SpanRecord, attrs: Span.AttributeRecord): GraphNode => ({
  spanId: record.spanId,
  parentSpanId: record.parentSpanId,
  name: record.name,
  status: record.status,
  errorType: record.errorType,
  startMillis: record.startMillis,
  durationMillis: record.durationMillis,
  attrs,
  events: record.events,
  links: record.links,
})

const decodedNodeOf = (
  record: SpanRecord,
  spec: Span.Span,
): Result.Result<GraphNode, ContractDecodeError> =>
  Result.map(decodeAttrs(spec, record), (attrs) => nodeOf(record, attrs))

const declaredNodeOf = (
  record: SpanRecord,
  declarations: ReadonlyMap<string, Span.Span>,
): Result.Result<GraphNode, ContractDecodeError> => {
  const spec = declarations.get(record.name)
  return spec === undefined
    ? Result.succeed(nodeOf(record, plainAttributes(record.attributes)))
    : decodedNodeOf(record, spec)
}

const childrenOf = (nodes: ReadonlyArray<GraphNode>, node: GraphNode): ReadonlyArray<GraphNode> =>
  nodes.filter((candidate) => candidate.parentSpanId === node.spanId)

const descendantsOf = (nodes: ReadonlyArray<GraphNode>, node: GraphNode): ReadonlyArray<GraphNode> => {
  const children = childrenOf(nodes, node)
  return [...children, ...children.flatMap((child) => descendantsOf(nodes, child))]
}

const graphOf = (traceId: string, nodes: ReadonlyArray<GraphNode>): TraceGraph => ({
  traceId,
  nodes,
  byId: (spec) => nodes.filter((node) => node.name === spec.name),
  children: (node) => childrenOf(nodes, node),
  descendants: (node) => descendantsOf(nodes, node),
})

const toGraph = (
  traceId: string,
  spans: ReadonlyArray<SpanRecord>,
  taxonomy: Taxonomy.Taxonomy,
): Result.Result<TraceGraph, ContractDecodeError> => {
  const declarations = indexDeclarations(taxonomy)
  return Result.map(
    Result.all(spans.map((record) => declaredNodeOf(record, declarations))),
    (nodes) => graphOf(traceId, nodes),
  )
}

export const decode = (
  traceId: string,
  spans: ReadonlyArray<SpanRecord>,
  taxonomy: Taxonomy.Taxonomy,
): Effect.Effect<TraceGraph, ContractDecodeError> => Effect.fromResult(toGraph(traceId, spans, taxonomy))

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const ORDER_ATTR = 'app.order.id'
  const ORDER_SPAN = 'fulfillment.settle'
  const NOISE_SPAN = 'noise.span'
  const ORDER_SPAN_ID = 's1'
  const NOISE_SPAN_ID = 's9'
  const TRACE_ID = 'trace-1'

  const PlaceOrder = Span.declare({
    id: ORDER_SPAN,
    name: ORDER_SPAN,
    attrs: Schema.Struct({ [ORDER_ATTR]: Schema.String }),
  })
  const PlaceOrderTaxonomy = Taxonomy.make('taxonomy-1').pipe(Taxonomy.add(PlaceOrder))

  const AttributeValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
  const Pair = Schema.Struct({ key: Schema.String, value: AttributeValue })
  const Extras = Schema.Array(Pair)

  type Extra = Schema.Schema.Type<typeof Pair>
  type AttributePairs = ReadonlyArray<readonly [string, Span.AttributeValue]>

  const pairsOf = (extras: ReadonlyArray<Extra>): AttributePairs => extras.map((entry) => [entry.key, entry.value])

  const recordOf = (name: string, spanId: string, pairs: AttributePairs): SpanRecord => ({
    traceId: TRACE_ID,
    spanId,
    parentSpanId: null,
    name,
    status: 'ok',
    errorType: null,
    startMillis: 0,
    durationMillis: 3,
    attributes: new Map(pairs),
    events: [],
    links: [],
  })

  const declaredRecord = (extras: ReadonlyArray<Extra>, orderId: string): SpanRecord =>
    recordOf(ORDER_SPAN, ORDER_SPAN_ID, [...pairsOf(extras), [ORDER_ATTR, orderId]])

  const missingRecord = (extras: ReadonlyArray<Extra>): SpanRecord =>
    recordOf(ORDER_SPAN, ORDER_SPAN_ID, pairsOf(extras))

  const noiseRecord = (extras: ReadonlyArray<Extra>): SpanRecord => recordOf(NOISE_SPAN, NOISE_SPAN_ID, pairsOf(extras))

  const soleAttribute = (attrs: Span.AttributeRecord, key: string, value: Span.AttributeValue): boolean =>
    Object.keys(attrs).length === 1 && attrs[key] === value

  const decodesDeclaredOnly = (extras: ReadonlyArray<Extra>, orderId: string): boolean => {
    const decoded = decodeAttrs(PlaceOrder, declaredRecord(extras, orderId))
    return Result.isSuccess(decoded) && soleAttribute(decoded.success, ORDER_ATTR, orderId)
  }

  const namesAttribute = (error: ContractDecodeError, attribute: string): boolean =>
    error.attribute === attribute && error.declarationId === PlaceOrder.id

  const namesSpan = (error: ContractDecodeError, spanId: string, name: string): boolean =>
    error.spanId === spanId && error.spanName === name

  const failsNamingAttribute = (extras: ReadonlyArray<Extra>): boolean => {
    const error = Effect.runSync(Effect.flip(decode(TRACE_ID, [missingRecord(extras)], PlaceOrderTaxonomy)))
    return namesAttribute(error, ORDER_ATTR) && namesSpan(error, ORDER_SPAN_ID, ORDER_SPAN)
  }

  const hasKeyCount = (attrs: Span.AttributeRecord, count: number): boolean => Object.keys(attrs).length === count

  const distinctKeyCount = (extras: ReadonlyArray<Extra>): number => new Set(extras.map((entry) => entry.key)).size

  const isUndecodedNoise = (node: GraphNode, extras: ReadonlyArray<Extra>): boolean =>
    node.name === NOISE_SPAN && hasKeyCount(node.attrs, distinctKeyCount(extras))

  const keepsUndecodedNode = (extras: ReadonlyArray<Extra>): boolean => {
    const graph = Effect.runSync(decode(TRACE_ID, [noiseRecord(extras)], PlaceOrderTaxonomy))
    const node = graph.nodes.find((candidate) => candidate.spanId === NOISE_SPAN_ID)
    return node !== undefined && isUndecodedNoise(node, extras)
  }

  it.prop(
    '∀r_Decode_=DeclaredOnly',
    [Extras, Schema.String],
    ([extras, orderId]) => decodesDeclaredOnly(extras, orderId),
  )

  it.prop('∀r_Missing_→ContractDecodeError', [Extras], ([extras]) => failsNamingAttribute(extras))

  it.prop('∀r_Undecoded_∈Nodes', [Extras], ([extras]) => keepsUndecodedNode(extras))
}
