import { describe } from '@effect/vitest'
import * as S from 'effect/Schema'
import { CustomerTier, FraudRiskScore, Money } from '../credit.schema.js'
import { LotId, SkuId, Version, WarehouseId } from '../inventory.schema.js'
import { refusalLaws } from './refusal-laws.js'

describe('domain schema refusals', () => {
  refusalLaws('SkuId', SkuId, S.String.pipe(S.check(S.isMaxLength(0))))
  refusalLaws('WarehouseId', WarehouseId, S.String.pipe(S.check(S.isMaxLength(0))))
  refusalLaws('LotId', LotId, S.String.pipe(S.check(S.isMaxLength(0))))
  refusalLaws('Version', Version, S.Int.pipe(S.check(S.isLessThanOrEqualTo(0))))
  refusalLaws('Money', Money, S.Finite.pipe(S.check(S.isLessThan(0))))
  refusalLaws('FraudRiskScore', FraudRiskScore, S.Int.pipe(S.check(S.isLessThan(0))))
  refusalLaws('CustomerTier', CustomerTier, S.String.pipe(S.check(S.isMinLength(100))))
})
