/// <reference types="vitest/importMeta" />
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Match, Result, Schema, type SchemaIssue } from 'effect'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import type { Attributes, GraphNode, SpanRecord, TraceGraph } from './TraceGraph.schema.js'

export * from './TraceGraph.schema.js'

export const byId = (graph: TraceGraph, spec: Span.Span): ReadonlyArray<GraphNode> =>
  graph.nodes.filter((node) => node.name === spec.name)

export const children = (graph: TraceGraph, node: GraphNode): ReadonlyArray<GraphNode> =>
  graph.nodes.filter((candidate) => candidate.parentSpanId === node.spanId)

export const descendants = (graph: TraceGraph, node: GraphNode): ReadonlyArray<GraphNode> => {
  const direct = children(graph, node)
  return [...direct, ...direct.flatMap((child) => descendants(graph, child))]
}

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

const decodeAttrs = (spec: Span.Span, record: SpanRecord): Result.Result<Attributes, ContractDecodeError> =>
  Result.mapError(
    Schema.decodeResult(Schema.toType(spec.attrs))(record.attributes),
    (error) => decodeFailure(spec, record, error.message, attributeNameOf(error.issue)),
  )

const nodeOf = (record: SpanRecord, attrs: Attributes): GraphNode => ({
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

const decodedNodeOf = (record: SpanRecord, spec: Span.Span): Result.Result<GraphNode, ContractDecodeError> =>
  Result.map(decodeAttrs(spec, record), (attrs) => nodeOf(record, attrs))

const declaredNodeOf = (
  record: SpanRecord,
  declarations: ReadonlyMap<string, Span.Span>,
): Result.Result<GraphNode, ContractDecodeError> => {
  const spec = declarations.get(record.name)
  return spec === undefined ? Result.succeed(nodeOf(record, record.attributes)) : decodedNodeOf(record, spec)
}

const graphOf = (traceId: string, nodes: ReadonlyArray<GraphNode>): TraceGraph => ({ traceId, nodes })

/**
 * Decodes the recorded spans of one trace against a taxonomy, purely: a declared span
 * whose required attributes do not decode refuses with {@link ContractDecodeError}
 * naming the declaration and the attribute, and a span no declaration accounts for enters
 * the graph as recorded. Failure is a `Result`, so the phase that reads the trace cannot
 * fail the pipeline by accident.
 */
export const decode = (
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

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const ORDER_ATTR = 'app.order.id'
  const ORDER_SPAN = 'fulfillment.settle'
  const NOISE_SPAN = 'noise.span'
  const ORDER_SPAN_ID = 's1'
  const NOISE_SPAN_ID = 's9'
  const ROOT_SPAN_ID = 'r0'
  const CHILD_SPAN_ID = 'c0'
  const TRACE_ID = 'trace-1'

  const PlaceOrder = Span.declare({
    id: ORDER_SPAN,
    name: ORDER_SPAN,
    attrs: Schema.Struct({ [ORDER_ATTR]: Schema.String }),
  })
  const Child = Span.declare({ id: NOISE_SPAN, name: NOISE_SPAN, attrs: Schema.Struct({}) })
  const DeclaredOnlyTaxonomy = Taxonomy.make('taxonomy-1').pipe(Taxonomy.add(PlaceOrder))
  const BothTaxonomy = Taxonomy.make('taxonomy-2').pipe(Taxonomy.add(PlaceOrder), Taxonomy.add(Child))

  const AttributeValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
  const Pair = Schema.Struct({ key: Schema.String, value: AttributeValue })
  const Extras = Schema.Array(Pair)

  type Extra = Schema.Schema.Type<typeof Pair>

  const pairsOf = (extras: ReadonlyArray<Extra>): Record<string, Span.AttributeValue> =>
    Object.fromEntries(extras.map((entry) => [entry.key, entry.value]))

  const recordOf = (
    name: string,
    spanId: string,
    parentSpanId: string | null,
    attributes: Record<string, Span.AttributeValue>,
  ): SpanRecord => ({
    traceId: TRACE_ID,
    spanId,
    parentSpanId,
    name,
    status: 'ok',
    errorType: null,
    startMillis: 0,
    durationMillis: 3,
    attributes,
    events: [],
    links: [],
  })

  const declaredRecord = (extras: ReadonlyArray<Extra>, orderId: string): SpanRecord =>
    recordOf(ORDER_SPAN, ORDER_SPAN_ID, null, { ...pairsOf(extras), [ORDER_ATTR]: orderId })

  const missingRecord = (extras: ReadonlyArray<Extra>): SpanRecord =>
    recordOf(ORDER_SPAN, ORDER_SPAN_ID, null, pairsOf(extras))

  const noiseRecord = (extras: ReadonlyArray<Extra>): SpanRecord =>
    recordOf(NOISE_SPAN, NOISE_SPAN_ID, null, pairsOf(extras))

  const soleAttribute = (attrs: Attributes, key: string, value: Span.AttributeValue): boolean =>
    Object.keys(attrs).length === 1 && attrs[key] === value

  const decodesDeclaredOnly = (extras: ReadonlyArray<Extra>, orderId: string): boolean => {
    const decoded = decodeAttrs(PlaceOrder, declaredRecord(extras, orderId))
    return Result.isSuccess(decoded) && soleAttribute(decoded.success, ORDER_ATTR, orderId)
  }

  const namesRefusal = (error: ContractDecodeError, attribute: string): boolean =>
    namesAttribute(error, attribute) && namesSpan(error, ORDER_SPAN_ID, ORDER_SPAN)

  const namesAttribute = (error: ContractDecodeError, attribute: string): boolean =>
    error.attribute === attribute && error.declarationId === PlaceOrder.id

  const namesSpan = (error: ContractDecodeError, spanId: string, name: string): boolean =>
    error.spanId === spanId && error.spanName === name

  const failsNamingAttribute = (extras: ReadonlyArray<Extra>): boolean => {
    const decoded = decode(TRACE_ID, [missingRecord(extras)], DeclaredOnlyTaxonomy)
    return Result.isFailure(decoded) && namesRefusal(decoded.failure, ORDER_ATTR)
  }

  const distinctKeyCount = (extras: ReadonlyArray<Extra>): number => new Set(extras.map((entry) => entry.key)).size

  const recordedAsObserved = (node: GraphNode, keyCount: number): boolean =>
    node.name === NOISE_SPAN && Object.keys(node.attrs).length === keyCount

  const findsSpan = (decoded: Result.Result<TraceGraph, ContractDecodeError>, spanId: string): GraphNode | undefined =>
    Result.isSuccess(decoded)
      ? decoded.success.nodes.find((candidate) => candidate.spanId === spanId)
      : undefined

  const keepsUndecodedNode = (extras: ReadonlyArray<Extra>): boolean => {
    const node = findsSpan(decode(TRACE_ID, [noiseRecord(extras)], BothTaxonomy), NOISE_SPAN_ID)
    return node !== undefined && recordedAsObserved(node, distinctKeyCount(extras))
  }

  const placedNodesOf = (extras: ReadonlyArray<Extra>): {
    readonly children: ReadonlyArray<GraphNode>
    readonly descendants: ReadonlyArray<GraphNode>
  } => {
    const decoded = decode(
      TRACE_ID,
      [
        recordOf(ORDER_SPAN, ROOT_SPAN_ID, null, { [ORDER_ATTR]: ORDER_SPAN_ID }),
        recordOf(NOISE_SPAN, CHILD_SPAN_ID, ROOT_SPAN_ID, pairsOf(extras)),
      ],
      BothTaxonomy,
    )
    return Result.match(decoded, {
      onFailure: () => ({ children: [], descendants: [] }),
      onSuccess: (graph) => {
        const root = graph.nodes.find((node) => node.spanId === ROOT_SPAN_ID)
        return root === undefined
          ? { children: [], descendants: [] }
          : { children: children(graph, root), descendants: descendants(graph, root) }
      },
    })
  }

  const childrenAreDescendants = (extras: ReadonlyArray<Extra>): boolean => {
    const placed = placedNodesOf(extras)
    const descendantIds = new Set(placed.descendants.map((node) => node.spanId))
    return placed.children.length > 0 && placed.children.every((node) => descendantIds.has(node.spanId))
  }

  it.prop(
    '∀r_DecodeAttrs_=DeclaredOnly',
    [Extras, Schema.String],
    ([extras, orderId]) => decodesDeclaredOnly(extras, orderId),
  )

  it.prop('∀r_MissingAttrs_→ContractDecodeError', [Extras], ([extras]) => failsNamingAttribute(extras))

  it.prop('∀r_UndeclaredSpan_∈Nodes', [Extras], ([extras]) => keepsUndecodedNode(extras))

  it.prop('∀r_Children_⊆Descendants', [Extras], ([extras]) => childrenAreDescendants(extras))
}
