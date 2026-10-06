import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { Schema } from 'effect'

export const BeginOperation = Schema.Struct({ owner: Contract.Principal, startedAt: Schema.DateTimeUtc })

export const ArmOperation = Schema.Struct({ ttlMs: Schema.Int, answer: Operations.SettlementAnswer })

export const SettleOperation = Schema.Struct({ answer: Operations.SettlementAnswer, settledAt: Schema.DateTimeUtc })

export class OperationMissing extends Schema.TaggedError<OperationMissing>()('OperationMissing', {}) {
  override get message(): string {
    return 'no operation is recorded'
  }
}
