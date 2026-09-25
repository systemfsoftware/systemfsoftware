/// <reference types="vitest/importMeta" />
import { Schema as S } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const Money = S.Finite.pipe(
  S.check(S.isGreaterThanOrEqualTo(0)),
  S.annotate({ identifier: 'Money' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/Money'),
)
export type Money = S.Schema.Type<typeof Money>

export const Amount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0)))
export type Amount = S.Schema.Type<typeof Amount>

export const CustomerTier = S.Literals(['VIP', 'Standard'])
export type CustomerTier = S.Schema.Type<typeof CustomerTier>

export const FraudRiskScore = S.Int.pipe(
  S.check(S.isBetween({ minimum: 0, maximum: 100 })),
  S.annotate({ identifier: 'FraudRiskScore' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/FraudRiskScore'),
)
export type FraudRiskScore = S.Schema.Type<typeof FraudRiskScore>

export const CreditAccount = S.Struct({
  customerId: S.String,
  creditLimit: Money,
  outstandingBalance: Money,
  overdraftPrivilege: Money,
})
export type CreditAccount = S.Schema.Type<typeof CreditAccount>

const amountSeeds = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]
const fraudRiskScoreSeeds = [
  -1,
  101,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  0,
  100,
]

const nonNegativeFinite = (value: number): boolean => Number.isFinite(value) && value >= 0
const inScoreRange = (value: number): boolean => value >= 0 && value <= 100
const boundedInteger = (value: number): boolean => Number.isInteger(value) && inScoreRange(value)

const moneyDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(Money)(value))
const amountDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(Amount)(value))
const fraudRiskScoreDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(FraudRiskScore)(value))

const verdictsAgainst = (
  decodes: (value: number) => boolean,
  shape: (value: number) => boolean,
  candidates: readonly number[],
): boolean => Arr.every(candidates, (candidate) => decodes(candidate) === shape(candidate))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static
  // import would enter the published module graph (packages/effect-memfs/src/driver-values.ts).
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_MoneyRefusal_≡NonNegative',
    { of: [S.Finite], subject: moneyDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonNegativeFinite, Arr.append(amountSeeds, value)),
  )

  it.prop(
    '∀n_AmountRefusal_≡NonNegative',
    { of: [S.Finite], subject: amountDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonNegativeFinite, Arr.append(amountSeeds, value)),
  )

  it.prop(
    '∀n_FraudRiskScoreRefusal_∈Bounds',
    { of: [S.Finite], subject: fraudRiskScoreDecodes },
    (subject, [value]) => verdictsAgainst(subject, boundedInteger, Arr.append(fraudRiskScoreSeeds, value)),
  )
}
