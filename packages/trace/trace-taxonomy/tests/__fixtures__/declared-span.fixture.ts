import { Span } from '@systemfsoftware/trace-taxonomy'
import { Schema as S } from 'effect'

export const PlaceOrderAttrs = S.Struct({
  'app.user.id': S.String,
  'app.order.items.count': S.Finite,
})

export const PlaceOrder = Span.declare({
  id: 'checkout.place_order',
  name: 'checkout.place_order',
  attrs: PlaceOrderAttrs,
})
