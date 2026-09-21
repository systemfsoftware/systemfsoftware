/// <reference types="vitest/importMeta" />
import { Schema as S } from 'effect'

export const Money = S.Finite.pipe(
  S.check(S.isGreaterThanOrEqualTo(0)),
  S.annotate({ identifier: 'Money' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/Money'),
)
export type Money = S.Schema.Type<typeof Money>

export const CustomerTier = S.Literals(['VIP', 'Standard'])
export type CustomerTier = S.Schema.Type<typeof CustomerTier>

export const FraudRiskScore = S.Int.pipe(
  S.check(S.isBetween({ minimum: 0, maximum: 100 })),
  S.annotate({ identifier: 'FraudRiskScore' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/FraudRiskScore'),
)
export type FraudRiskScore = S.Schema.Type<typeof FraudRiskScore>

export class CreditAccount extends S.Class<CreditAccount>('CreditAccount')({
  customerId: S.String,
  creditLimit: Money,
  outstandingBalance: Money,
  overdraftPrivilege: Money,
}) {}
