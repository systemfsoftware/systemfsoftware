import { Schema } from 'effect'

export const BudgetLimits = Schema.Struct({
  decisions: Schema.optional(Schema.Finite),
  calls: Schema.optional(Schema.Finite),
})
export type BudgetLimits = typeof BudgetLimits.Type

export const BudgetSpend = Schema.Struct({
  decisions: Schema.Finite,
  calls: Schema.Finite,
})
export type BudgetSpend = typeof BudgetSpend.Type
