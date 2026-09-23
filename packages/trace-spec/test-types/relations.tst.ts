import { Contract, Graph, Rel } from '@systemfsoftware/trace-spec'
import type * as Result from 'effect/Result'
import { describe, expect, it } from 'tstyche'
import {
  Charge,
  FulfillmentTaxonomy,
  Settle,
  spanRecord,
  TRACE_ID,
} from '../tests/__fixtures__/fulfillment-trace.schema.js'

describe('Rel', () => {
  it('a relation is the evaluation itself and answers with the verdict union, never a bare boolean', () => {
    const relation = Rel.child(Settle, Charge)
    expect(relation).type.toBe<Rel.Relation>()
    expect(relation).type.not.toBeAssignableTo<(graph: Graph.TraceGraph) => boolean>()
    expect<Rel.Verdict>().type.toBe<Rel.Hold | Rel.Break>()
    expect<Rel.Verdict>().type.not.toBe<boolean>()
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

  it('order takes two declared spans and refuses a bare span name string', () => {
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
  it('decodes purely and fails only with the contract decode error', () => {
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
    expect(decoded).type.toBe<Result.Result<Graph.TraceGraph, Contract.ContractDecodeError>>()
  })
})

describe('TraceDisparityError', () => {
  it('carries the failure without gherkin vocabulary', () => {
    expect<Contract.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly keyword: string }>()
    expect<Contract.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly text: string }>()
  })

  it('carries the broken relation and where the observed graph was written', () => {
    expect<Contract.TraceDisparityError>().type.toBeAssignableTo<{
      readonly relationId: string
      readonly dumpPath: string | null
    }>()
  })
})
