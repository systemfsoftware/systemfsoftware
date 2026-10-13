import { Schema } from 'effect'

export const Unlimited = Schema.TaggedStruct('Unlimited', {})
export type Unlimited = typeof Unlimited.Type

export const Limited = Schema.TaggedStruct('Limited', {
  count: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
})
export type Limited = typeof Limited.Type

export const BudgetLimit = Schema.Union([Unlimited, Limited]).pipe(Schema.toTaggedUnion('_tag'))
export type BudgetLimit = typeof BudgetLimit.Type

export const BudgetLimits = Schema.Struct({
  decisions: BudgetLimit,
  calls: BudgetLimit,
})
export type BudgetLimits = typeof BudgetLimits.Type

export const BudgetSpend = Schema.Struct({
  decisions: Schema.Finite,
  calls: Schema.Finite,
})
export type BudgetSpend = typeof BudgetSpend.Type
