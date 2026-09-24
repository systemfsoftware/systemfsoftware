import { Schema } from 'effect'

/**
 * The pure model of the checkout's per-customer gate: orders placed for one
 * customer are served one at a time, so an order always enters with nobody
 * else from that same customer still being served.
 *
 * The model is intentionally free of any import from the example's own source
 * (the gate must be judged against this, never against itself).
 */
export const Customer = Schema.Literals(['ada', 'bo'])
export type Customer = Schema.Schema.Type<typeof Customer>

export const GateCommand = Schema.Union([
  Schema.TaggedStruct('PlaceOrder', { customer: Customer }),
])
export type GateCommand = Schema.Schema.Type<typeof GateCommand>

export type GateResponse = number

export const gateModel = {
  state: Schema.Finite,
  initial: 0,
  step: (state: number): readonly [number, GateResponse] => [state, 0],
}
