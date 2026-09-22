import { Edge, Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Schema as S } from 'effect'

export const FulfillmentSettle = Span.declare({
  id: 'inventory.fulfillment.settle',
  name: 'inventory.fulfillment.settle',
  attrs: S.Struct({
    'app.customer.id': S.String,
    'app.fraud.risk.score': S.Finite,
    'app.kit.count': S.Finite,
    'app.order.id': S.String,
    'app.order.line.count': S.Finite,
  }),
})

export const ReservationCommit = Span.declare({
  id: 'inventory.fulfillment.reservation.commit',
  name: 'inventory.fulfillment.reservation.commit',
  attrs: S.Struct({
    'app.customer.id': S.String,
    'app.order.id': S.String,
    'app.reservation.event.count': S.Finite,
  }),
})

export const CreditCharge = Span.declare({
  id: 'inventory.fulfillment.credit.charge',
  name: 'inventory.fulfillment.credit.charge',
  attrs: S.Struct({
    'app.charge.amount': S.Finite,
    'app.customer.id': S.String,
  }),
})

export const fulfillmentTaxonomy = Taxonomy.make({
  id: 'inventory.fulfillment',
  spans: [FulfillmentSettle, ReservationCommit, CreditCharge],
  edges: [Edge.child(FulfillmentSettle, ReservationCommit), Edge.child(FulfillmentSettle, CreditCharge)],
  forbid: [{ span: CreditCharge, unless: 'allocate' }],
})
