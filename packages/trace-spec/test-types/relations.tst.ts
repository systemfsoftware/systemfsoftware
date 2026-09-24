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
  it('Should_BeEvaluationAnsweringVerdictUnion_When_RelationConstructed', () => {
    const relation = Rel.child(Settle, Charge)
    expect(relation).type.toBe<Rel.Relation>()
    expect(relation).type.not.toBeAssignableTo<(graph: Graph.TraceGraph) => boolean>()
    expect<Rel.Verdict>().type.toBe<Rel.Hold | Rel.Break>()
    expect<Rel.Verdict>().type.not.toBe<boolean>()
  })

  it('Should_AcceptDeclaredSpanStatusAndRefuseOthers_When_StatusCalled', () => {
    expect(Rel.status).type.toBeCallableWith(Settle, 'ok')
    expect(Rel.status).type.not.toBeCallableWith(Settle, 'cancelled')
  })

  it('Should_AcceptDeclaredAttrsAndRefuseOthers_When_AttrsCalled', () => {
    expect(Rel.attrs).type.toBeCallableWith(Settle, { 'app.order.id': 'order-7' })
    expect(Rel.attrs).type.not.toBeCallableWith(Settle, { 'app.order.id': 7 })
    expect(Rel.attrs).type.not.toBeCallableWith(Settle, { 'app.order.note': 'gift' })
  })
})

describe('Rel compound relations', () => {
  it('Should_InferGraphNodeInPredicateAndRefuseNonBoolean_When_ForallCalled', () => {
    const relation = Rel.forall(Settle, (node) => {
      expect(node).type.toBe<Graph.GraphNode>()
      return node.status === 'ok'
    }, 'a settle span is not ok')
    expect(relation).type.toBe<Rel.Relation>()
    expect(Rel.forall).type.not.toBeCallableWith(Settle, () => 'yes', 'a settle span is not ok')
  })

  it('Should_AcceptEventNameAndRefuseNumber_When_EventCalled', () => {
    expect(Rel.event).type.toBeCallableWith(Charge, 'charged')
    expect(Rel.event).type.not.toBeCallableWith(Charge, 7)
  })

  it('Should_AcceptTwoDeclaredSpansAndRefuseBareName_When_OrderCalled', () => {
    expect(Rel.order).type.toBeCallableWith(Settle, Charge)
    expect(Rel.order).type.not.toBeCallableWith(Settle, 'credit.charge')
  })

  it('Should_AcceptRelationsOnlyAndRefuseString_When_AnyCalled', () => {
    expect(Rel.any).type.toBeCallableWith(Rel.exists(Settle), Rel.absent(Charge))
    expect(Rel.any).type.not.toBeCallableWith(Rel.exists(Settle), Rel.absent(Charge), 'absent(credit.charge)')
  })

  it('Should_AcceptRelationAndRefuseBareId_When_NotCalled', () => {
    expect(Rel.not).type.toBeCallableWith(Rel.exists(Settle))
    expect(Rel.not).type.not.toBeCallableWith('exists(fulfillment.settle)')
  })

  it('Should_AnswerWithVerdictUnion_When_CompoundRelationBuilt', () => {
    expect(Rel.forall(Settle, (node) => node.status === 'ok', 'detail')).type.toBe<Rel.Relation>()
    expect(Rel.order(Settle, Charge)).type.toBe<Rel.Relation>()
    expect(Rel.any(Rel.exists(Settle))).type.toBe<Rel.Relation>()
    expect(Rel.not(Rel.exists(Settle))).type.toBe<Rel.Relation>()
  })
})

describe('Graph.decode', () => {
  it('Should_DecodePurelyAndFailWithDecodeError_When_GraphDecoded', () => {
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
  it('Should_CarryFailureWithoutGherkinVocabulary_When_DisparityErrorRead', () => {
    expect<Contract.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly keyword: string }>()
    expect<Contract.TraceDisparityError>().type.not.toBeAssignableTo<{ readonly text: string }>()
  })

  it('Should_CarryBrokenRelationAndDumpPath_When_DisparityErrorRead', () => {
    expect<Contract.TraceDisparityError>().type.toBeAssignableTo<{
      readonly relationId: string
      readonly dumpPath: string | null
    }>()
  })
})
