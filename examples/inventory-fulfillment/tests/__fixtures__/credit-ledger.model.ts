import { Schema } from 'effect'

/**
 * The pure model of the settlement store's account ledger: a charge adds its
 * amount to one customer's outstanding balance, and the operation answers with
 * the balance it left behind. Two orders charging one account concurrently must
 * still land as if they had charged one after the other — that is the whole
 * point of running each order as one serializable unit of work.
 *
 * The model is intentionally free of any import from the example's own source
 * (the ledger must be judged against this, never against itself).
 */
export const LedgerCustomer = Schema.Literals(['ada', 'bo'])
export type LedgerCustomer = Schema.Schema.Type<typeof LedgerCustomer>

export const LedgerAmount = Schema.Literals([1, 2, 3])
export type LedgerAmount = Schema.Schema.Type<typeof LedgerAmount>

export const LedgerCommand = Schema.Union([
  Schema.TaggedStruct('Charge', { customer: LedgerCustomer, amount: LedgerAmount }),
])
export type LedgerCommand = Schema.Schema.Type<typeof LedgerCommand>

export const LedgerState = Schema.Struct({ ada: Schema.Finite, bo: Schema.Finite })
export type LedgerState = Schema.Schema.Type<typeof LedgerState>

export const emptyLedger: LedgerState = { ada: 0, bo: 0 }

const balanced = (state: LedgerState, command: LedgerCommand, balance: number): LedgerState =>
  command.customer === 'ada' ? { ...state, ada: balance } : { ...state, bo: balance }

export const creditLedgerModel = {
  state: LedgerState,
  initial: emptyLedger,
  step: (state: LedgerState, command: LedgerCommand): readonly [LedgerState, number] => {
    const balance = state[command.customer] + command.amount
    return [balanced(state, command, balance), balance]
  },
}
