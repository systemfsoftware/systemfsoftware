/// <reference types="vitest/importMeta" />
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, Equal, Match, Option, Result, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { GraphNode, SpanRecord, Status, TraceGraph } from './Graph.js'
import { byId, children, decode, descendants } from './Graph.js'
import { Break, Hold, Verdict } from './Verdict.schema.js'

export { Break, Hold, Verdict }

export interface Relation {
  readonly id: string
  readonly soft: boolean
  readonly softenable: boolean
  (graph: TraceGraph): Verdict
}

interface Parts {
  readonly id: string
  readonly soft: boolean
  readonly softenable: boolean
  readonly evaluate: (graph: TraceGraph) => Verdict
}

const relation = (parts: Parts): Relation =>
  Object.assign((graph: TraceGraph): Verdict => parts.evaluate(graph), {
    id: parts.id,
    soft: parts.soft,
    softenable: parts.softenable,
  })

const matchedNodes = (graph: TraceGraph, spec: Span.Span): ReadonlyArray<GraphNode> => byId(graph, spec)

const inspectedOf = (nodes: ReadonlyArray<GraphNode>): ReadonlyArray<string> => nodes.map((node) => node.spanId)

const matchedAll = <A>(items: ReadonlyArray<A>, predicate: (item: A) => boolean): boolean =>
  items.length > 0 && items.every(predicate)

const isBreak = (verdict: Verdict): verdict is Break => Schema.is(Break)(verdict)

const isHold = (verdict: Verdict): boolean => Schema.is(Hold)(verdict)

const verdictOf = (options: {
  readonly id: string
  readonly inspected: ReadonlyArray<string>
  readonly holds: boolean
  readonly detail: string
}): Verdict =>
  options.holds
    ? Hold.make({ conjunct: options.id, inspected: options.inspected })
    : Break.make({ conjunct: options.id, inspected: options.inspected, detail: options.detail })

interface Declaration {
  readonly id: string
  readonly spans: ReadonlyArray<Span.Span>
  readonly softenable: boolean
  readonly detail: string
  readonly holds: (graph: TraceGraph) => boolean
}

const declared = (declaration: Declaration): Relation =>
  relation({
    id: declaration.id,
    soft: false,
    softenable: declaration.softenable,
    evaluate: (graph) => {
      const inspected = declaration.spans.flatMap((span) => inspectedOf(byId(graph, span)))
      return verdictOf({
        id: declaration.id,
        inspected,
        holds: declaration.holds(graph),
        detail: declaration.detail,
      })
    },
  })

const holdsCountOf = (
  spec: Span.Span,
  expected: (count: number) => boolean,
): (graph: TraceGraph) => boolean =>
(graph) => expected(matchedNodes(graph, spec).length)

const holdsEveryOf = (
  spec: Span.Span,
  predicate: (node: GraphNode) => boolean,
): (graph: TraceGraph) => boolean =>
(graph) => matchedAll(matchedNodes(graph, spec), predicate)

export const exists = <S extends Span.Span>(spec: S): Relation =>
  declared({
    id: `exists(${spec.id})`,
    spans: [spec],
    softenable: false,
    detail: `no ${spec.id} span was emitted`,
    holds: holdsCountOf(spec, (count) => count > 0),
  })

export const absent = <S extends Span.Span>(spec: S): Relation =>
  declared({
    id: `absent(${spec.id})`,
    spans: [spec],
    softenable: false,
    detail: `a ${spec.id} span was emitted`,
    holds: holdsCountOf(spec, (count) => count === 0),
  })

export const unique = <S extends Span.Span>(spec: S): Relation =>
  declared({
    id: `unique(${spec.id})`,
    spans: [spec],
    softenable: true,
    detail: `expected exactly one ${spec.id} span`,
    holds: holdsCountOf(spec, (count) => count === 1),
  })

const childIdsOf = (graph: TraceGraph, parents: ReadonlyArray<GraphNode>): ReadonlySet<string> =>
  new Set(parents.flatMap((parent) => children(graph, parent)).map((node) => node.spanId))

const descendantIdsOf = (graph: TraceGraph, parents: ReadonlyArray<GraphNode>): ReadonlySet<string> =>
  new Set(parents.flatMap((parent) => descendants(graph, parent)).map((node) => node.spanId))

const startsAtOrAfter = (earlier: GraphNode, later: GraphNode): boolean => later.startMillis >= earlier.startMillis

const startsAfterSome = (earlier: ReadonlyArray<GraphNode>, later: GraphNode): boolean =>
  earlier.some((node) => startsAtOrAfter(node, later))

const reachedUnder = (
  graph: TraceGraph,
  parent: Span.Span,
  childSpan: Span.Span,
  reach: (graph: TraceGraph, parents: ReadonlyArray<GraphNode>) => ReadonlySet<string>,
): boolean => {
  const reached = reach(graph, matchedNodes(graph, parent))
  return matchedNodes(graph, childSpan).some((node) => reached.has(node.spanId))
}

const childImpl = (parent: Span.Span, childSpan: Span.Span): Relation =>
  declared({
    id: `child(${parent.id},${childSpan.id})`,
    spans: [parent, childSpan],
    softenable: true,
    detail: `no ${childSpan.id} span is a direct child of a ${parent.id} span`,
    holds: (graph) => reachedUnder(graph, parent, childSpan, childIdsOf),
  })

export const child: {
  (childSpan: Span.Span): (parent: Span.Span) => Relation
  (parent: Span.Span, childSpan: Span.Span): Relation
} = dual(2, childImpl)

const descendantImpl = (parent: Span.Span, childSpan: Span.Span): Relation =>
  declared({
    id: `descendant(${parent.id},${childSpan.id})`,
    spans: [parent, childSpan],
    softenable: true,
    detail: `no ${childSpan.id} span descends from a ${parent.id} span`,
    holds: (graph) => reachedUnder(graph, parent, childSpan, descendantIdsOf),
  })

export const descendant: {
  (childSpan: Span.Span): (parent: Span.Span) => Relation
  (parent: Span.Span, childSpan: Span.Span): Relation
} = dual(2, descendantImpl)

const orderImpl = (before: Span.Span, after: Span.Span): Relation =>
  declared({
    id: `order(${before.id},${after.id})`,
    spans: [before, after],
    softenable: true,
    detail: `a ${after.id} span starts before every ${before.id} span`,
    holds: (graph) =>
      matchedAll(matchedNodes(graph, after), (node) => startsAfterSome(matchedNodes(graph, before), node)),
  })

export const order: {
  (after: Span.Span): (before: Span.Span) => Relation
  (before: Span.Span, after: Span.Span): Relation
} = dual(2, orderImpl)

const statusImpl = (spec: Span.Span, expected: Status): Relation =>
  declared({
    id: `status(${spec.id},${expected})`,
    spans: [spec],
    softenable: true,
    detail: `a ${spec.id} span is not ${expected}`,
    holds: holdsEveryOf(spec, (node) => node.status === expected),
  })

export const status: {
  (expected: Status): (spec: Span.Span) => Relation
  (spec: Span.Span, expected: Status): Relation
} = dual(2, statusImpl)

const errorTypeImpl = (spec: Span.Span, expected: string): Relation =>
  declared({
    id: `errorType(${spec.id},${expected})`,
    spans: [spec],
    softenable: true,
    detail: `a ${spec.id} span carries a different error.type`,
    holds: holdsEveryOf(spec, (node) => node.errorType === expected),
  })

export const errorType: {
  (expected: string): (spec: Span.Span) => Relation
  (spec: Span.Span, expected: string): Relation
} = dual(2, errorTypeImpl)

const partialMatches = (
  attributes: Span.AttributeRecord,
  partial: Partial<Span.AttributeRecord>,
): boolean =>
  Object.entries(partial)
    .filter(([, value]) => value !== undefined)
    .every(([key, value]) => Equal.equals(attributes[key], value))

const attrsImpl = <S extends Span.Span>(spec: S, partial: Partial<Span.AttrsOf<S>>): Relation =>
  declared({
    id: `attrs(${spec.id})`,
    spans: [spec],
    softenable: true,
    detail: `a ${spec.id} span carries a different declared attribute`,
    holds: holdsEveryOf(spec, (node) => partialMatches(node.attrs, partial)),
  })

export const attrs: {
  <S extends Span.Span>(partial: Partial<Span.AttrsOf<S>>): (spec: S) => Relation
  <S extends Span.Span>(spec: S, partial: Partial<Span.AttrsOf<S>>): Relation
} = dual(2, attrsImpl)

const durationLessThanImpl = (spec: Span.Span, millis: number): Relation =>
  declared({
    id: `durationLessThan(${spec.id},${millis})`,
    spans: [spec],
    softenable: true,
    detail: `a ${spec.id} span exceeded ${millis}ms`,
    holds: holdsEveryOf(spec, (node) => node.durationMillis < millis),
  })

export const durationLessThan: {
  (millis: number): (spec: Span.Span) => Relation
  (spec: Span.Span, millis: number): Relation
} = dual(2, durationLessThanImpl)

const carriesEvent = (name: string) => (node: GraphNode): boolean => node.events.some((event) => event.name === name)

const eventImpl = (spec: Span.Span, name: string): Relation =>
  declared({
    id: `event(${spec.id},${name})`,
    spans: [spec],
    softenable: true,
    detail: `a ${spec.id} span carries no ${name} event`,
    holds: holdsEveryOf(spec, carriesEvent(name)),
  })

export const event: {
  (name: string): (spec: Span.Span) => Relation
  (spec: Span.Span, name: string): Relation
} = dual(2, eventImpl)

const forallImpl = (spec: Span.Span, predicate: (node: GraphNode) => boolean, detail: string): Relation => {
  const id = `forall(${spec.id})`
  return relation({
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
  })
}

export const forall: {
  (predicate: (node: GraphNode) => boolean, detail: string): (spec: Span.Span) => Relation
  (spec: Span.Span, predicate: (node: GraphNode) => boolean, detail: string): Relation
} = dual(3, forallImpl)

export const soft = (self: Relation): Relation =>
  self.softenable
    ? relation({ id: self.id, soft: true, softenable: true, evaluate: (graph) => self(graph) })
    : self

const negatedVerdict = (id: string, inner: Verdict): Verdict =>
  Match.value(inner).pipe(
    Match.tag(
      'Hold',
      (held) => Break.make({ conjunct: id, inspected: held.inspected, detail: `${held.conjunct} held` }),
    ),
    Match.tag('Break', (breach) => Hold.make({ conjunct: id, inspected: breach.inspected })),
    Match.exhaustive,
  )

export const not = (self: Relation): Relation => {
  const id = `not(${self.id})`
  return relation({
    id,
    soft: false,
    softenable: false,
    evaluate: (graph) => negatedVerdict(id, self(graph)),
  })
}

const collectSoft = (id: string, breaks: ReadonlyArray<Break>): Verdict => {
  const inspected = breaks.flatMap((breach) => breach.inspected)
  return breaks.length === 0
    ? Hold.make({ conjunct: id, inspected })
    : Break.make({ conjunct: id, inspected, detail: breaks.map((breach) => breach.conjunct).join(', ') })
}

const firstHardBreak = (relations: ReadonlyArray<Relation>, graph: TraceGraph): Break | null =>
  relations
    .filter((relation) => !relation.soft)
    .map((relation) => relation(graph))
    .find(isBreak) ?? null

const softBreaks = (relations: ReadonlyArray<Relation>, graph: TraceGraph): ReadonlyArray<Break> =>
  relations
    .filter((relation) => relation.soft)
    .map((relation) => relation(graph))
    .filter(isBreak)

interface Combination {
  readonly id: string
  readonly relations: ReadonlyArray<Relation>
  readonly soft: boolean
  readonly softenable: boolean
}

const combined = (options: Combination): Relation =>
  relation({
    id: options.id,
    soft: options.soft,
    softenable: options.softenable,
    evaluate: (graph) =>
      firstHardBreak(options.relations, graph) ?? collectSoft(options.id, softBreaks(options.relations, graph)),
  })

export const all = (...relations: ReadonlyArray<Relation>): Relation =>
  combined({
    id: `all(${relations.map((relation) => relation.id).join(', ')})`,
    relations,
    soft: relations.every((relation) => relation.soft),
    softenable: true,
  })

export const any = (...relations: ReadonlyArray<Relation>): Relation => {
  const id = `any(${relations.map((relation) => relation.id).join(', ')})`
  return relation({
    id,
    soft: false,
    softenable: false,
    evaluate: (graph) => {
      const verdicts = relations.map((relation) => relation(graph))
      const inspected = verdicts.flatMap((verdict) => verdict.inspected)
      return verdicts.some(isHold)
        ? Hold.make({ conjunct: id, inspected })
        : Break.make({ conjunct: id, inspected, detail: verdicts.map((verdict) => verdict.conjunct).join(', ') })
    },
  })
}

const REACH_BY_RELATION: Record<
  Taxonomy.Edge['relation'],
  (graph: TraceGraph, parents: ReadonlyArray<GraphNode>) => ReadonlySet<string>
> = {
  child: childIdsOf,
  descendant: descendantIdsOf,
}

const placementOf = (edge: Taxonomy.Edge): Relation => {
  const id = `placement(${edge.relation}:${edge.parent.id},${edge.child.id})`
  return relation({
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
  })
}

const forbidsAt = (entry: Taxonomy.Forbidden, path: string): boolean =>
  Option.match(entry.unless, { onNone: () => true, onSome: (tag) => tag !== path })

const forbiddenOn = (path: string) => (entry: Taxonomy.Forbidden): ReadonlyArray<Relation> =>
  forbidsAt(entry, path) ? [absent(entry.span)] : []

const fromTaxonomyImpl = (taxonomy: Taxonomy.Taxonomy, options: { readonly path: string }): Relation =>
  combined({
    id: `fromTaxonomy(${taxonomy.id},${options.path})`,
    relations: [...taxonomy.edges.map(placementOf), ...taxonomy.forbidden.flatMap(forbiddenOn(options.path))],
    soft: false,
    softenable: false,
  })

export const fromTaxonomy: {
  (options: { readonly path: string }): (taxonomy: Taxonomy.Taxonomy) => Relation
  (taxonomy: Taxonomy.Taxonomy, options: { readonly path: string }): Relation
} = dual(2, fromTaxonomyImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const TRACE_ID = 'trace-rel-1'
  const ORDER_ATTR = 'app.order.id'

  const SettleAttrs = Schema.Struct({ [ORDER_ATTR]: Schema.String })
  const Settle = Span.declare({ id: 'fulfillment.settle', name: 'fulfillment.settle', attrs: SettleAttrs })
  const Charge = Span.declare({ id: 'credit.charge', name: 'credit.charge', attrs: SettleAttrs })
  const Ship = Span.declare({ id: 'shipment.dispatch', name: 'shipment.dispatch', attrs: SettleAttrs })
  const TraceTaxonomy = Taxonomy.make('taxonomy-rel').pipe(
    Taxonomy.add(Settle),
    Taxonomy.add(Charge),
    Taxonomy.add(Ship),
  )

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
    attributes: { [ORDER_ATTR]: node.id },
    events: node.events.map((item) => ({ name: item, attributes: {} })),
    links: [],
  })

  const recordsOf = (spec: Spec): ReadonlyArray<SpanRecord> => [
    ...spec.settles.map((node: RootSpec) => recordOf(Settle.name, node, null)),
    ...spec.charges.map((node: LeafSpec) => recordOf(Charge.name, node, node.parentId)),
    ...spec.ships.map((node: ShipSpec) => recordOf(Ship.name, node, node.parentId)),
  ]

  const graphOf = (spec: Spec): Effect.Effect<TraceGraph> =>
    Result.match(decode(TRACE_ID, recordsOf(spec), TraceTaxonomy), {
      onFailure: Effect.die,
      onSuccess: Effect.succeed,
    })

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

  const holdsLike = (relation: Relation, spec: Spec, expected: boolean): Effect.Effect<boolean> =>
    Effect.map(graphOf(spec), (graph) => isHold(relation(graph)) === expected)

  const verdictLike = (relation: Relation, spec: Spec): Effect.Effect<Verdict> =>
    Effect.map(graphOf(spec), (graph) => relation(graph))

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

  const allBehaves = (fixtureOf: (spec: Spec) => Relation, spec: Spec): Effect.Effect<boolean> =>
    Effect.map(verdictLike(fixtureOf(spec), spec), (verdict) => {
      const hard = expectedHardBreaks(spec)
      return hard.length > 0 ? verdict.conjunct === hard[0] : reportsSoft(verdict, expectedSoftBreaks(spec))
    })

  const softeningPreserves = (soften: (relation: Relation) => Relation, spec: Spec): Effect.Effect<boolean> =>
    Effect.map(
      Effect.all([verdictLike(soften(unique(Charge)), spec), verdictLike(unique(Charge), spec)]),
      ([softened, plain]) => isHold(softened) === isHold(plain) && soften(exists(Settle)).soft === false,
    )

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

  const ForbidTaxonomy = Taxonomy.make('taxonomy-forbid').pipe(
    Taxonomy.add(Settle),
    Taxonomy.add(Charge),
    Taxonomy.add(Ship),
    Taxonomy.forbid(Charge, { unless: 'allocate' }),
  )

  const forbidHonoursPath = (offPath: Relation, spec: Spec): Effect.Effect<boolean> =>
    Effect.map(
      Effect.all([
        holdsLike(offPath, spec, spec.charges.length === 0),
        holdsLike(fromTaxonomy(ForbidTaxonomy, { path: 'allocate' }), spec, true),
      ]),
      ([absentOffPath, permittedOnPath]) => absentOffPath && permittedOnPath,
    )

  it.effect.prop(
    '∀g_Exists_=Nonempty',
    { of: [GraphSpec], subject: exists(Settle) },
    (relation, [spec]) =>
      Effect.map(
        Effect.all([graphOf(spec), holdsLike(relation, spec, spec.settles.length > 0)]),
        ([graph, holds]) => byId(graph, Settle).length === spec.settles.length && holds,
      ),
  )

  it.effect.prop(
    '∀g_Absent_=¬Nonempty',
    { of: [GraphSpec], subject: absent(Settle) },
    (relation, [spec]) => holdsLike(relation, spec, spec.settles.length === 0),
  )

  it.effect.prop(
    '∀g_Unique_=Singleton',
    { of: [GraphSpec], subject: unique(Settle) },
    (relation, [spec]) => holdsLike(relation, spec, spec.settles.length === 1),
  )

  it.effect.prop(
    '∀g_Child_=ParentEdge',
    { of: [GraphSpec], subject: child(Settle, Charge) },
    (relation, [spec]) => holdsLike(relation, spec, expectedChild(spec)),
  )

  it.effect.prop(
    '∀g_Descendant_=AncestorWalk',
    { of: [GraphSpec], subject: descendant(Settle, Ship) },
    (relation, [spec]) => holdsLike(relation, spec, expectedDescendant(spec)),
  )

  it.effect.prop(
    '∀g_All_→FirstHardBreak',
    { of: [GraphSpec], subject: allFixture },
    (fixtureOf, [spec]) => allBehaves(fixtureOf, spec),
  )

  it.effect.prop(
    '∀g_Soft_=HoldsAlike',
    { of: [GraphSpec], subject: soft },
    (soften, [spec]) => softeningPreserves(soften, spec),
  )

  it.effect.prop(
    '∀g_Placement_=EveryChildPlaced',
    { of: [GraphSpec], subject: placementOf({ relation: 'child', parent: Settle, child: Charge }) },
    (relation, [spec]) => holdsLike(relation, spec, everyChargePlaced(spec)),
  )

  it.effect.prop(
    '∀g_Placement_=EveryDescendantPlaced',
    { of: [GraphSpec], subject: placementOf({ relation: 'descendant', parent: Settle, child: Ship }) },
    (relation, [spec]) => holdsLike(relation, spec, everyShipPlaced(spec)),
  )

  it.effect.prop(
    '∀g_Forbid_=AbsentOffPath',
    { of: [GraphSpec], subject: fromTaxonomy(ForbidTaxonomy, { path: 'hold' }) },
    (offPath, [spec]) => forbidHonoursPath(offPath, spec),
  )

  const alwaysHolds = (): boolean => true

  const expectedForall = (spec: Spec): boolean =>
    spec.charges.length > 0 && spec.charges.every((node) => node.durationMillis < spec.bound)

  const expectedEvent = (spec: Spec): boolean =>
    spec.charges.length > 0 && spec.charges.every((node) => node.events.includes(spec.event))

  const expectedOrder = (spec: Spec): boolean =>
    spec.charges.length > 0 &&
    spec.charges.every((charge) => spec.settles.some((settle) => charge.startMillis >= settle.startMillis))

  const boundedCharges = (spec: Spec): Relation =>
    forall(Charge, (node) => node.durationMillis < spec.bound, 'a charge span exceeded the bound')

  const chargesCarrying = (spec: Spec): Relation => event(Charge, spec.event)

  it.effect.prop(
    '∀g_Forall_=EveryNodePredicate',
    { of: [GraphSpec], subject: boundedCharges },
    (bounded, [spec]) => holdsLike(bounded(spec), spec, expectedForall(spec)),
  )

  it.effect.prop(
    '∀g_Forall_→NonVacuous',
    { of: [GraphSpec], subject: forall(Charge, alwaysHolds, 'unused detail') },
    (relation, [spec]) =>
      Effect.map(graphOf(spec), (graph) => isBreak(relation(graph)) === (spec.charges.length === 0)),
  )

  it.effect.prop(
    '∀g_Event_=EveryNodeCarries',
    { of: [GraphSpec], subject: chargesCarrying },
    (carries, [spec]) => holdsLike(carries(spec), spec, expectedEvent(spec)),
  )

  it.effect.prop(
    '∀g_Order_=AfterSomeBefore',
    { of: [GraphSpec], subject: order(Settle, Charge) },
    (relation, [spec]) => holdsLike(relation, spec, expectedOrder(spec)),
  )

  it.effect.prop(
    '∀g_Any_=AtLeastOneHolds',
    { of: [GraphSpec], subject: any(exists(Settle), exists(Charge)) },
    (relation, [spec]) => holdsLike(relation, spec, spec.settles.length > 0 || spec.charges.length > 0),
  )

  const anyFixture = (): Relation => any(exists(Settle), unique(Charge))

  const anyExpected = (spec: Spec): boolean => spec.settles.length > 0 || spec.charges.length === 1

  const anyBehaves = (fixture: Relation, spec: Spec): Effect.Effect<boolean> =>
    Effect.map(
      verdictLike(fixture, spec),
      (verdict) => anyExpected(spec) ? isHold(verdict) : namesBreak(verdict, [exists(Settle).id, unique(Charge).id]),
    )

  it.effect.prop(
    '∀g_Any_→NamesEveryConjunct',
    { of: [GraphSpec], subject: anyFixture() },
    (fixture, [spec]) => anyBehaves(fixture, spec),
  )

  it.effect.prop(
    '∀g_Any_=ConjunctAgreement',
    { of: [GraphSpec], subject: any(unique(Charge)) },
    (conjunct, [spec]) =>
      Effect.map(
        Effect.all([verdictLike(conjunct, spec), verdictLike(unique(Charge), spec)]),
        ([disjunct, plain]) => isHold(disjunct) === isHold(plain),
      ),
  )

  it.effect.prop(
    '∀g_Not_=Negation',
    { of: [GraphSpec], subject: not(unique(Charge)) },
    (negated, [spec]) =>
      Effect.map(
        Effect.all([verdictLike(negated, spec), verdictLike(unique(Charge), spec)]),
        ([broke, plain]) => isHold(broke) === !isHold(plain),
      ),
  )

  it.effect.prop(
    '∀g_Not_→NamesInnerOnHold',
    { of: [GraphSpec], subject: not(unique(Charge)) },
    (negated, [spec]) =>
      Effect.map(
        Effect.all([verdictLike(negated, spec), verdictLike(unique(Charge), spec)]),
        ([verdict, innerVerdict]) => isHold(innerVerdict) ? namesBreak(verdict, [unique(Charge).id]) : isHold(verdict),
      ),
  )

  it.effect.prop(
    '∀g_NotNot_=Relation',
    { of: [GraphSpec], subject: not(not(unique(Charge))) },
    (doublyNegated, [spec]) =>
      Effect.map(
        Effect.all([verdictLike(doublyNegated, spec), verdictLike(unique(Charge), spec)]),
        ([doubled, plain]) => isHold(doubled) === isHold(plain),
      ),
  )
}
