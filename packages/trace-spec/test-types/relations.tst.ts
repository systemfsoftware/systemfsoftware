import { ContractDecodeError, FailureDump, Graph, Rel, TraceDisparityError, Verdict } from '@systemfsoftware/trace-spec'
import { Effect, FileSystem } from 'effect'
import { describe, expect, it } from 'tstyche'
import {
  Charge,
  FulfillmentTaxonomy,
  Settle,
  spanRecord,
  TRACE_ID,
} from '../tests/__fixtures__/fulfillment-trace.schema.js'

declare const graph: Graph.TraceGraph
declare const breach: Verdict.Break

describe('Rel', () => {
  it('a relation answers with the verdict union, never a bare boolean', () => {
    const relation = Rel.child(Settle, Charge)
    expect(relation.evaluate).type.toBe<(graph: Graph.TraceGraph) => Verdict.Verdict>()
    expect(relation.evaluate).type.not.toBeAssignableTo<(graph: Graph.TraceGraph) => boolean>()
    expect<Verdict.Verdict>().type.toBe<Verdict.Hold | Verdict.Break>()
    expect<Verdict.Verdict>().type.not.toBe<boolean>()
  })

  it('status accepts a declared span status and refuses another', () => {
    expect(Rel.status).type.toBeCallableWith(Settle, 'ok')
    expect(Rel.status).type.not.toBeCallableWith(Settle, 'cancelled')
  })

  it('attrs accepts the declared attributes and refuses mistyped or undeclared ones', () => {
    expect(Rel.attrs).type.toBeCallableWith(Settle, { 'app.order.id': 'order-7' })
    expect(Rel.attrs).type.not.toBeCallableWith(Settle, { 'app.order.id': 7 })
    expect(Rel.attrs).type.not.toBeCallableWith(Settle, { 'app.order.note': 'gift' })
  })
})

describe('Rel compound relations', () => {
  it('forall infers the graph node inside its predicate and refuses a non-boolean predicate', () => {
    const relation = Rel.forall(Settle, (node) => {
      expect(node).type.toBe<Graph.GraphNode>()
      return node.status === 'ok'
    }, 'a settle span is not ok')
    expect(relation).type.toBe<Rel.Relation>()
    expect(Rel.forall).type.not.toBeCallableWith(Settle, () => 'yes', 'a settle span is not ok')
  })

  it('event takes an event name string and refuses a number', () => {
    expect(Rel.event).type.toBeCallableWith(Charge, 'charged')
    expect(Rel.event).type.not.toBeCallableWith(Charge, 7)
  })

  it('order takes two span refs and refuses a bare span name string', () => {
    expect(Rel.order).type.toBeCallableWith(Settle, Charge)
    expect(Rel.order).type.not.toBeCallableWith(Settle, 'credit.charge')
  })

  it('any takes relations only and refuses a stray string conjunct', () => {
    expect(Rel.any).type.toBeCallableWith(Rel.exists(Settle), Rel.absent(Charge))
    expect(Rel.any).type.not.toBeCallableWith(Rel.exists(Settle), Rel.absent(Charge), 'absent(credit.charge)')
  })

  it('not takes a relation and refuses a bare relation id string', () => {
    expect(Rel.not).type.toBeCallableWith(Rel.exists(Settle))
    expect(Rel.not).type.not.toBeCallableWith('exists(fulfillment.settle)')
  })

  it('the compound relations answer with the verdict union', () => {
    expect(Rel.forall(Settle, (node) => node.status === 'ok', 'detail')).type.toBe<Rel.Relation>()
    expect(Rel.order(Settle, Charge)).type.toBe<Rel.Relation>()
    expect(Rel.any(Rel.exists(Settle))).type.toBe<Rel.Relation>()
    expect(Rel.not(Rel.exists(Settle))).type.toBe<Rel.Relation>()
  })
})

describe('Graph.decode', () => {
  it('decodes without services and fails only with the contract decode error', () => {
    const decoded = Graph.decode(
      TRACE_ID,
      [
        spanRecord({
          spanId: 'settle-1',
          name: Settle.name,
          parentSpanId: null,
          status: 'ok',
          attributes: { 'app.order.id': 'order-7', 'app.order.total': 1 },
        }),
      ],
      FulfillmentTaxonomy,
    )
    expect(decoded).type.toBe<Effect.Effect<Graph.TraceGraph, ContractDecodeError.ContractDecodeError, never>>()
  })
})

describe('FailureDump', () => {
  it('records the failure without failing and needs the file system', () => {
    const recorded = FailureDump.disparity({ graph, relation: Rel.exists(Settle), break: breach })
    expect(recorded).type.toBe<Effect.Effect<TraceDisparityError.TraceDisparityError, never, FileSystem.FileSystem>>()
  })
})

describe('TraceDisparityError', () => {
  it('carries the failure without gherkin vocabulary', () => {
    expect<TraceDisparityError.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly keyword: string }>()
    expect<TraceDisparityError.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly text: string }>()
  })
})
