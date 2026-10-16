/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

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

const boundSeeds = [-1, 0, 1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

const isNonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0

const boundDecodes = (value: number): boolean =>
  Result.isSuccess(Schema.decodeResult(Limited)({ _tag: 'Limited', count: value }))

if (import.meta.vitest !== void 0) {
  // tsdown defines `import.meta.vitest` as `undefined`, so a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_LimitedRefusal_≡NonNegativeInteger',
    { of: [Schema.Finite], subject: boundDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(boundSeeds, value),
        (candidate) => subject(candidate) === isNonNegativeInteger(candidate),
      ),
  )
}
