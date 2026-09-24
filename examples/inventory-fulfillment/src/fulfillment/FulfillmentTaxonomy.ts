import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Schema as S } from 'effect'
import { QuantityOnHand } from '../inventory/inventory.schema.js'
import { Amount, CustomerTier } from './credit.schema.js'

export const PlaceOrder = Span.declare({
  id: 'inventory.fulfillment.place',
  name: 'inventory.fulfillment.place',
  attrs: S.Struct({ 'app.order.id': S.String, 'app.credit.tier': CustomerTier }),
})

export const ReservationCommit = Span.declare({
  id: 'inventory.fulfillment.reservation.commit',
  name: 'inventory.fulfillment.reservation.commit',
  attrs: S.Struct({
    'app.customer.id': S.String,
    'app.order.id': S.String,
    'app.reservation.event.count': QuantityOnHand,
  }),
})

export const CreditCharge = Span.declare({
  id: 'inventory.fulfillment.credit.charge',
  name: 'inventory.fulfillment.credit.charge',
  attrs: S.Struct({
    'app.charge.amount': Amount,
    'app.customer.id': S.String,
  }),
})

export const fulfillmentTaxonomy = Taxonomy.make('inventory.fulfillment').pipe(
  Taxonomy.descendant(PlaceOrder, ReservationCommit),
  Taxonomy.descendant(PlaceOrder, CreditCharge),
  Taxonomy.forbid(CreditCharge, { unless: 'allocate' }),
)
