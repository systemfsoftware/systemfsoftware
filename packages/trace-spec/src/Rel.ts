/// <reference types="vitest/importMeta" />
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, Equal, Match, Schema } from 'effect'
import type { AttrsOf, GraphNode, SpanRecord, Status, TraceGraph } from './Graph.js'
import { decode } from './Graph.js'
import { Break, Hold, type Verdict } from './Verdict.schema.js'

export interface Relation {
  readonly id: string
  readonly soft: boolean
  readonly softenable: boolean
  readonly evaluate: (graph: TraceGraph) => Verdict
}

const matchedNodes = (graph: TraceGraph, spec: Span.SpanRef): ReadonlyArray<GraphNode> => graph.byId(spec)

const inspectedOf = (nodes: ReadonlyArray<GraphNode>): ReadonlyArray<string> => nodes.map((node) => node.spanId)

const matchedAll = <A>(items: ReadonlyArray<A>, predicate: (item: A) => boolean): boolean =>
  items.length > 0 && items.every(predicate)

const isBreak = (verdict: Verdict): verdict is Break => Schema.is(Break)(verdict)

const isHold = (verdict: Verdict): boolean =>
  Match.value(verdict).pipe(Match.tag('Hold', () => true), Match.orElse(() => false))

const verdictOf = (options: {
  readonly id: string
  readonly inspected: ReadonlyArray<string>
  readonly holds: boolean
  readonly detail: string
}): Verdict =>
  options.holds
    ? Hold.make({ conjunct: options.id, inspected: options.inspected })
    : Break.make({ conjunct: options.id, inspected: options.inspected, detail: options.detail })

interface SpecOptions {
  readonly id: string
  readonly spec: Span.SpanRef
  readonly softenable: boolean
  readonly detail: string
  readonly holds: (nodes: ReadonlyArray<GraphNode>) => boolean
}

const specRelation = (options: SpecOptions): Relation => ({
  id: options.id,
  soft: false,
  softenable: options.softenable,
  evaluate: (graph) => {
    const nodes = matchedNodes(graph, options.spec)
    return verdictOf({
      id: options.id,
      inspected: inspectedOf(nodes),
      holds: options.holds(nodes),
      detail: options.detail,
    })
  },
})

interface CountOptions {
  readonly spec: Span.SpanRef
  readonly softenable: boolean
  readonly detail: string
  readonly holds: (count: number) => boolean
}

const existenceOf = (id: string, options: CountOptions): Relation =>
  specRelation({
    id,
    spec: options.spec,
    softenable: options.softenable,
    detail: options.detail,
    holds: (nodes) => options.holds(nodes.length),
  })

export const exists = <S extends Span.SpanRef>(spec: S): Relation =>
  existenceOf(`exists(${spec.id})`, {
    spec,
    softenable: false,
    detail: `no ${spec.id} span was emitted`,
    holds: (count) => count > 0,
  })

export const absent = <S extends Span.SpanRef>(spec: S): Relation =>
  existenceOf(`absent(${spec.id})`, {
    spec,
    softenable: false,
    detail: `a ${spec.id} span was emitted`,
    holds: (count) => count === 0,
  })

export const unique = <S extends Span.SpanRef>(spec: S): Relation =>
  existenceOf(`unique(${spec.id})`, {
    spec,
    softenable: true,
    detail: `expected exactly one ${spec.id} span`,
    holds: (count) => count === 1,
  })

interface EdgeOptions {
  readonly id: string
  readonly parent: Span.SpanRef
  readonly childSpec: Span.SpanRef
  readonly detail: string
  readonly reached: (graph: TraceGraph, parents: ReadonlyArray<GraphNode>) => ReadonlySet<string>
}

const edgeRelation = (options: EdgeOptions): Relation => ({
  id: options.id,
  soft: false,
  softenable: true,
  evaluate: (graph) => {
    const parents = matchedNodes(graph, options.parent)
    const children = matchedNodes(graph, options.childSpec)
    const reached = options.reached(graph, parents)
    return verdictOf({
      id: options.id,
      inspected: [...inspectedOf(parents), ...inspectedOf(children)],
      holds: children.some((node) => reached.has(node.spanId)),
      detail: options.detail,
    })
  },
})

const childIdsOf = (graph: TraceGraph, parents: ReadonlyArray<GraphNode>): ReadonlySet<string> =>
  new Set(parents.flatMap((parent) => graph.children(parent)).map((node) => node.spanId))

const descendantIdsOf = (graph: TraceGraph, parents: ReadonlyArray<GraphNode>): ReadonlySet<string> =>
  new Set(parents.flatMap((parent) => graph.descendants(parent)).map((node) => node.spanId))

const startsAtOrAfter = (earlier: GraphNode, later: GraphNode): boolean => later.startMillis >= earlier.startMillis

const startsAfterSome = (earlier: ReadonlyArray<GraphNode>, later: GraphNode): boolean =>
  earlier.some((node) => startsAtOrAfter(node, later))

export const order = (before: Span.SpanRef, after: Span.SpanRef): Relation => {
  const id = `order(${before.id},${after.id})`
  return {
    id,
    soft: false,
    softenable: true,
    evaluate: (graph) => {
      const earlies = matchedNodes(graph, before)
      const lates = matchedNodes(graph, after)
      return verdictOf({
        id,
        inspected: [...inspectedOf(earlies), ...inspectedOf(lates)],
        holds: matchedAll(lates, (node) => startsAfterSome(earlies, node)),
        detail: `a ${after.id} span starts before every ${before.id} span`,
      })
    },
  }
}

export const child = (parent: Span.SpanRef, childSpec: Span.SpanRef): Relation =>
  edgeRelation({
    id: `child(${parent.id},${childSpec.id})`,
    parent,
    childSpec,
    detail: `no ${childSpec.id} span is a direct child of a ${parent.id} span`,
    reached: childIdsOf,
  })

export const descendant = (parent: Span.SpanRef, childSpec: Span.SpanRef): Relation =>
  edgeRelation({
    id: `descendant(${parent.id},${childSpec.id})`,
    parent,
    childSpec,
    detail: `no ${childSpec.id} span descends from a ${parent.id} span`,
    reached: descendantIdsOf,
  })

interface EveryOptions {
  readonly id: string
  readonly spec: Span.SpanRef
  readonly detail: string
  readonly predicate: (node: GraphNode) => boolean
}

const everyRelation = (options: EveryOptions): Relation => ({
  id: options.id,
  soft: false,
  softenable: true,
  evaluate: (graph) => {
    const nodes = matchedNodes(graph, options.spec)
    return verdictOf({
      id: options.id,
      inspected: inspectedOf(nodes),
      holds: matchedAll(nodes, options.predicate),
      detail: options.detail,
    })
  },
})

export const status = (spec: Span.SpanRef, expected: Status): Relation =>
  everyRelation({
    id: `status(${spec.id},${expected})`,
    spec,
    detail: `a ${spec.id} span is not ${expected}`,
    predicate: (node) => node.status === expected,
  })

export const errorType = (spec: Span.SpanRef, expected: string): Relation =>
  everyRelation({
    id: `errorType(${spec.id},${expected})`,
    spec,
    detail: `a ${spec.id} span carries a different error.type`,
    predicate: (node) => node.errorType === expected,
  })

const partialMatches = (
  attributes: Span.AttributeRecord,
  partial: Partial<Span.AttributeRecord>,
): boolean =>
  Object.entries(partial)
    .filter(([, value]) => value !== undefined)
    .every(([key, value]) => Equal.equals(attributes[key], value))

export const attrs = <S extends Span.SpanRef>(spec: S, partial: Partial<AttrsOf<S>>): Relation =>
  everyRelation({
    id: `attrs(${spec.id})`,
    spec,
    detail: `a ${spec.id} span carries a different declared attribute`,
    predicate: (node) => partialMatches(node.attrs, partial),
  })

export const durationLessThan = (spec: Span.SpanRef, millis: number): Relation =>
  everyRelation({
    id: `durationLessThan(${spec.id},${millis})`,
    spec,
    detail: `a ${spec.id} span exceeded ${millis}ms`,
    predicate: (node) => node.durationMillis < millis,
  })

const carriesEvent = (name: string) => (node: GraphNode): boolean => node.events.some((event) => event.name === name)

export const event = (spec: Span.SpanRef, name: string): Relation =>
  everyRelation({
    id: `event(${spec.id},${name})`,
    spec,
    detail: `a ${spec.id} span carries no ${name} event`,
    predicate: carriesEvent(name),
  })

export const forall = (
  spec: Span.SpanRef,
  predicate: (node: GraphNode) => boolean,
  detail: string,
): Relation => {
  const id = `forall(${spec.id})`
  return {
    id,
    soft: false,
    softenable: true,
    evaluate: (graph) => {
      const nodes = matchedNodes(graph, spec)
      return verdictOf({
        id,
        inspected: inspectedOf(nodes),
        holds: matchedAll(nodes, predicate),
        detail: nodes.length === 0 ? `no ${spec.id} span was emitted: forall is non-vacuous` : detail,
      })
    },
  }
}

export const soft = (relation: Relation): Relation => (relation.softenable ? { ...relation, soft: true } : relation)

const firstHardBreak = (relations: ReadonlyArray<Relation>, graph: TraceGraph): Break | null =>
  relations
    .filter((relation) => !relation.soft)
    .map((relation) => relation.evaluate(graph))
    .find(isBreak) ?? null

const softBreaks = (relations: ReadonlyArray<Relation>, graph: TraceGraph): ReadonlyArray<Break> =>
  relations
    .filter((relation) => relation.soft)
    .map((relation) => relation.evaluate(graph))
    .filter(isBreak)

const collectSoft = (id: string, breaks: ReadonlyArray<Break>): Verdict => {
  const inspected = breaks.flatMap((item) => item.inspected)
  return breaks.length === 0
    ? Hold.make({ conjunct: id, inspected })
    : Break.make({ conjunct: id, inspected, detail: breaks.map((item) => item.conjunct).join(', ') })
}

const evaluateAll = (id: string, relations: ReadonlyArray<Relation>, graph: TraceGraph): Verdict => {
  const hard = firstHardBreak(relations, graph)
  return hard !== null ? hard : collectSoft(id, softBreaks(relations, graph))
}

export const all = (...relations: ReadonlyArray<Relation>): Relation => {
  const id = `all(${relations.map((relation) => relation.id).join(', ')})`
  return {
    id,
    soft: relations.every((relation) => relation.soft),
    softenable: true,
    evaluate: (graph) => evaluateAll(id, relations, graph),
  }
}

const inspectedAcross = (verdicts: ReadonlyArray<Verdict>): ReadonlyArray<string> =>
  verdicts.flatMap((verdict) => verdict.inspected)

const anyVerdict = (id: string, verdicts: ReadonlyArray<Verdict>): Verdict =>
  verdicts.some(isHold)
    ? Hold.make({ conjunct: id, inspected: inspectedAcross(verdicts) })
    : Break.make({
      conjunct: id,
      inspected: inspectedAcross(verdicts),
      detail: verdicts.map((verdict) => verdict.conjunct).join(', '),
    })

export const any = (...relations: ReadonlyArray<Relation>): Relation => {
  const id = `any(${relations.map((relation) => relation.id).join(', ')})`
  return {
    id,
    soft: false,
    softenable: false,
    evaluate: (graph) => anyVerdict(id, relations.map((relation) => relation.evaluate(graph))),
  }
}

const negatedVerdict = (id: string, inner: Verdict): Verdict =>
  isHold(inner)
    ? Break.make({ conjunct: id, inspected: inner.inspected, detail: `${inner.conjunct} held` })
    : Hold.make({ conjunct: id, inspected: inner.inspected })

export const not = (relation: Relation): Relation => {
  const id = `not(${relation.id})`
  return {
    id,
    soft: false,
    softenable: false,
    evaluate: (graph) => negatedVerdict(id, relation.evaluate(graph)),
  }
}

const REACH_BY_RELATION: Record<
  Taxonomy.EdgeRelation,
  (graph: TraceGraph, parents: ReadonlyArray<GraphNode>) => ReadonlySet<string>
> = {
  child: childIdsOf,
  descendant: descendantIdsOf,
}

const placementOf = (edge: Taxonomy.TaxonomyEdge): Relation => {
  const id = `placement(${edge.relation}:${edge.parent.id},${edge.child.id})`
  return {
    id,
    soft: false,
    softenable: false,
    evaluate: (graph) => {
      const placed = matchedNodes(graph, edge.child)
      const reached = REACH_BY_RELATION[edge.relation](graph, matchedNodes(graph, edge.parent))
      return verdictOf({
        id,
        inspected: inspectedOf(placed),
        holds: placed.every((node) => reached.has(node.spanId)),
        detail: `a ${edge.child.id} span is not a ${edge.relation} of any ${edge.parent.id} span`,
      })
    },
  }
}

const forbiddenOn = (path: string) => (entry: Taxonomy.ForbiddenSpan): ReadonlyArray<Relation> =>
  entry.unless === path ? [] : [absent(entry.span)]

export const fromTaxonomy = (taxonomy: Taxonomy.Taxonomy, options: { readonly path: string }): Relation => {
  const contract = all(...taxonomy.edges.map(placementOf), ...taxonomy.forbid.flatMap(forbiddenOn(options.path)))
  return { ...contract, id: `fromTaxonomy(${taxonomy.id},${options.path})`, soft: false, softenable: false }
}

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const TRACE_ID = 'trace-rel-1'
  const ORDER_ATTR = 'app.order.id'

  const SettleAttrs = Schema.Struct({ [ORDER_ATTR]: Schema.String })
  const Settle = Span.declare({ id: 'fulfillment.settle', name: 'fulfillment.settle', attrs: SettleAttrs })
  const Charge = Span.declare({ id: 'credit.charge', name: 'credit.charge', attrs: SettleAttrs })
  const Ship = Span.declare({ id: 'shipment.dispatch', name: 'shipment.dispatch', attrs: SettleAttrs })
  const TraceTaxonomy = Taxonomy.make({ id: 'taxonomy-rel', spans: [Settle, Charge, Ship], edges: [], forbid: [] })

  const StatusSchema = Schema.Literals(['ok', 'unset', 'error'])
  const EventSchema = Schema.Literals(['placed', 'charged'])
  const Root = Schema.Struct({
    id: Schema.Literals(['s0', 's1', 's2']),
    status: StatusSchema,
    startMillis: Schema.Finite,
    durationMillis: Schema.Finite,
    events: Schema.Array(EventSchema),
  })
  const Leaf = Schema.Struct({
    id: Schema.Literals(['c0', 'c1', 'c2']),
    parentId: Schema.NullOr(Schema.Literals(['s0', 's1', 's2', 'ghost'])),
    status: StatusSchema,
    startMillis: Schema.Finite,
    durationMillis: Schema.Finite,
    events: Schema.Array(EventSchema),
  })
  const GrandChild = Schema.Struct({
    id: Schema.Literals(['d0', 'd1', 'd2']),
    parentId: Schema.NullOr(Schema.Literals(['c0', 'c1', 'c2', 'ghost'])),
    status: StatusSchema,
    startMillis: Schema.Finite,
    durationMillis: Schema.Finite,
    events: Schema.Array(EventSchema),
  })
  const GraphSpec = Schema.Struct({
    settles: Schema.Array(Root),
    charges: Schema.Array(Leaf),
    ships: Schema.Array(GrandChild),
    bound: Schema.Finite,
    event: EventSchema,
  })

  type RootSpec = Schema.Schema.Type<typeof Root>
  type LeafSpec = Schema.Schema.Type<typeof Leaf>
  type ShipSpec = Schema.Schema.Type<typeof GrandChild>
  type Spec = Schema.Schema.Type<typeof GraphSpec>

  const recordOf = (
    name: string,
    node: {
      readonly id: string
      readonly status: Status
      readonly startMillis: number
      readonly durationMillis: number
      readonly events: ReadonlyArray<'placed' | 'charged'>
    },
    parentSpanId: string | null,
  ): SpanRecord => ({
    traceId: TRACE_ID,
    spanId: node.id,
    parentSpanId,
    name,
    status: node.status,
    errorType: null,
    startMillis: node.startMillis,
    durationMillis: node.durationMillis,
    attributes: new Map([[ORDER_ATTR, node.id]]),
    events: node.events.map((item) => ({ name: item, attributes: new Map<string, Span.AttributeValue>() })),
    links: [],
  })

  const recordsOf = (spec: Spec): ReadonlyArray<SpanRecord> => [
    ...spec.settles.map((node: RootSpec) => recordOf(Settle.name, node, null)),
    ...spec.charges.map((node: LeafSpec) => recordOf(Charge.name, node, node.parentId)),
    ...spec.ships.map((node: ShipSpec) => recordOf(Ship.name, node, node.parentId)),
  ]

  const graphOf = (spec: Spec): TraceGraph => Effect.runSync(decode(TRACE_ID, recordsOf(spec), TraceTaxonomy))

  const settleIdsOf = (spec: Spec): ReadonlySet<string> => new Set(spec.settles.map((node) => node.id))

  const expectedChild = (spec: Spec): boolean =>
    spec.charges.some((node) => node.parentId !== null && settleIdsOf(spec).has(node.parentId))

  const linkedChargeIds = (spec: Spec): ReadonlySet<string> =>
    new Set(
      spec.charges
        .filter((node) => node.parentId !== null && settleIdsOf(spec).has(node.parentId))
        .map((node) => node.id),
    )

  const expectedDescendant = (spec: Spec): boolean => {
    const linked = linkedChargeIds(spec)
    return spec.ships.some((ship) => ship.parentId !== null && linked.has(ship.parentId))
  }

  const holdsLike = (relation: Relation, spec: Spec, expected: boolean): boolean =>
    isHold(relation.evaluate(graphOf(spec))) === expected

  const allFixture = (spec: Spec): Relation =>
    all(exists(Settle), unique(Charge), soft(status(Charge, 'error')), soft(durationLessThan(Charge, spec.bound)))

  const expectedHardBreaks = (spec: Spec): ReadonlyArray<string> =>
    [
      { id: exists(Settle).id, broke: spec.settles.length === 0 },
      { id: unique(Charge).id, broke: spec.charges.length !== 1 },
    ]
      .filter((entry) => entry.broke)
      .map((entry) => entry.id)

  const expectedSoftBreaks = (spec: Spec): ReadonlyArray<string> =>
    [
      { id: status(Charge, 'error').id, broke: !matchedAll(spec.charges, (node) => node.status === 'error') },
      {
        id: durationLessThan(Charge, spec.bound).id,
        broke: !matchedAll(spec.charges, (node) => node.durationMillis < spec.bound),
      },
    ]
      .filter((entry) => entry.broke)
      .map((entry) => entry.id)

  const namesBreak = (verdict: Verdict, expected: ReadonlyArray<string>): boolean =>
    isBreak(verdict) && expected.every((id) => verdict.detail.includes(id))

  const reportsSoft = (verdict: Verdict, expected: ReadonlyArray<string>): boolean =>
    expected.length === 0 ? isHold(verdict) : namesBreak(verdict, expected)

  const allBehaves = (spec: Spec): boolean => {
    const verdict = allFixture(spec).evaluate(graphOf(spec))
    const hard = expectedHardBreaks(spec)
    return hard.length > 0 ? verdict.conjunct === hard[0] : reportsSoft(verdict, expectedSoftBreaks(spec))
  }

  const softeningPreserves = (spec: Spec): boolean =>
    isHold(soft(unique(Charge)).evaluate(graphOf(spec))) ===
      isHold(unique(Charge).evaluate(graphOf(spec))) && soft(exists(Settle)).soft === false

  const placedShipIds = (spec: Spec): ReadonlySet<string> => {
    const linked = linkedChargeIds(spec)
    return new Set(
      spec.ships.filter((ship) => ship.parentId !== null && linked.has(ship.parentId)).map((ship) => ship.id),
    )
  }

  const everyChargePlaced = (spec: Spec): boolean => {
    const linked = linkedChargeIds(spec)
    return spec.charges.every((node) => linked.has(node.id))
  }

  const everyShipPlaced = (spec: Spec): boolean => {
    const placed = placedShipIds(spec)
    return spec.ships.every((ship) => placed.has(ship.id))
  }

  const ForbidTaxonomy = Taxonomy.make({
    id: 'taxonomy-forbid',
    spans: [Settle, Charge, Ship],
    edges: [],
    forbid: [{ span: Charge, unless: 'allocate' }],
  })

  const forbidHonoursPath = (spec: Spec): boolean =>
    holdsLike(fromTaxonomy(ForbidTaxonomy, { path: 'hold' }), spec, spec.charges.length === 0) &&
    holdsLike(fromTaxonomy(ForbidTaxonomy, { path: 'allocate' }), spec, true)

  it.prop('∀g_Exists_=Nonempty', [GraphSpec], ([spec]) => {
    const graph = graphOf(spec)
    return matchedNodes(graph, Settle).length === spec.settles.length &&
      holdsLike(exists(Settle), spec, spec.settles.length > 0)
  })

  it.prop('∀g_Absent_=¬Nonempty', [GraphSpec], ([spec]) => holdsLike(absent(Settle), spec, spec.settles.length === 0))

  it.prop('∀g_Unique_=Singleton', [GraphSpec], ([spec]) => holdsLike(unique(Settle), spec, spec.settles.length === 1))

  it.prop('∀g_Child_=ParentEdge', [GraphSpec], ([spec]) => holdsLike(child(Settle, Charge), spec, expectedChild(spec)))

  it.prop(
    '∀g_Descendant_=AncestorWalk',
    [GraphSpec],
    ([spec]) => holdsLike(descendant(Settle, Ship), spec, expectedDescendant(spec)),
  )

  it.prop('∀g_All_→FirstHardBreak', [GraphSpec], ([spec]) => allBehaves(spec))

  it.prop('∀g_Soft_=HoldsAlike', [GraphSpec], ([spec]) => softeningPreserves(spec))

  it.prop(
    '∀g_Placement_=EveryChildPlaced',
    [GraphSpec],
    ([spec]) =>
      holdsLike(placementOf({ relation: 'child', parent: Settle, child: Charge }), spec, everyChargePlaced(spec)),
  )

  it.prop(
    '∀g_Placement_=EveryDescendantPlaced',
    [GraphSpec],
    ([spec]) =>
      holdsLike(placementOf({ relation: 'descendant', parent: Settle, child: Ship }), spec, everyShipPlaced(spec)),
  )

  it.prop('∀g_Forbid_=AbsentOffPath', [GraphSpec], ([spec]) => forbidHonoursPath(spec))

  const always = (): boolean => true

  const expectedForall = (spec: Spec): boolean =>
    spec.charges.length > 0 && spec.charges.every((node) => node.durationMillis < spec.bound)

  const expectedEvent = (spec: Spec): boolean =>
    spec.charges.length > 0 && spec.charges.every((node) => node.events.includes(spec.event))

  const expectedOrder = (spec: Spec): boolean =>
    spec.charges.length > 0 &&
    spec.charges.every((charge) => spec.settles.some((settle) => charge.startMillis >= settle.startMillis))

  it.prop(
    '∀g_Forall_=EveryNodePredicate',
    [GraphSpec],
    ([spec]) =>
      holdsLike(
        forall(Charge, (node) => node.durationMillis < spec.bound, 'a charge span exceeded the bound'),
        spec,
        expectedForall(spec),
      ),
  )

  it.prop(
    '∀g_Forall_→NonVacuous',
    [GraphSpec],
    ([spec]) => isBreak(forall(Charge, always, 'unused detail').evaluate(graphOf({ ...spec, charges: [] }))),
  )

  it.prop(
    '∀g_Event_=EveryNodeCarries',
    [GraphSpec],
    ([spec]) => holdsLike(event(Charge, spec.event), spec, expectedEvent(spec)),
  )

  it.prop(
    '∀g_Order_=AfterSomeBefore',
    [GraphSpec],
    ([spec]) => holdsLike(order(Settle, Charge), spec, expectedOrder(spec)),
  )

  it.prop(
    '∀g_Any_=AtLeastOneHolds',
    [GraphSpec],
    ([spec]) =>
      holdsLike(any(exists(Settle), exists(Charge)), spec, spec.settles.length > 0 || spec.charges.length > 0),
  )

  const anyFixture = (): Relation => any(exists(Settle), unique(Charge))

  const anyExpected = (spec: Spec): boolean => spec.settles.length > 0 || spec.charges.length === 1

  const anyBehaves = (spec: Spec): boolean => {
    const verdict = anyFixture().evaluate(graphOf(spec))
    return anyExpected(spec) ? isHold(verdict) : namesBreak(verdict, [exists(Settle).id, unique(Charge).id])
  }

  it.prop('∀g_Any_→NamesEveryConjunct', [GraphSpec], ([spec]) => anyBehaves(spec))

  it.prop(
    '∀g_Any_=ConjunctAgreement',
    [GraphSpec],
    ([spec]) => isHold(any(unique(Charge)).evaluate(graphOf(spec))) === isHold(unique(Charge).evaluate(graphOf(spec))),
  )

  it.prop(
    '∀g_Not_=Negation',
    [GraphSpec],
    ([spec]) => isHold(not(unique(Charge)).evaluate(graphOf(spec))) === !isHold(unique(Charge).evaluate(graphOf(spec))),
  )

  it.prop('∀g_Not_→NamesInnerOnHold', [GraphSpec], ([spec]) => {
    const inner = unique(Charge)
    const verdict = not(inner).evaluate(graphOf(spec))
    return isHold(inner.evaluate(graphOf(spec))) ? namesBreak(verdict, [inner.id]) : isHold(verdict)
  })

  it.prop(
    '∀g_NotNot_=Relation',
    [GraphSpec],
    ([spec]) =>
      isHold(not(not(unique(Charge))).evaluate(graphOf(spec))) === isHold(unique(Charge).evaluate(graphOf(spec))),
  )
}
