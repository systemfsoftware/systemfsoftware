import { Schema } from 'effect'
import { Completed, Refused } from '../Answer/answer.schema.js'
import { Unavailable } from '../Answer/unavailable.schema.js'
import { Principal } from '../Principal/principal.schema.js'
import { OperationId } from './operation.schema.js'

const SettledTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-contract/OperationSettled')

export class Pending extends Schema.TaggedClass<Pending>()('Pending', {
  owner: Principal,
  startedAt: Schema.DateTimeUtc,
}) {}

export const SettlementAnswer = Schema.Union([Completed, Refused, Unavailable])
export type SettlementAnswer = typeof SettlementAnswer.Type

export class Settled extends Schema.TaggedClass<Settled>()('Settled', {
  answer: SettlementAnswer,
  settledAt: Schema.DateTimeUtc,
}) {
  readonly [SettledTypeId] = SettledTypeId
}

export const OperationState = Schema.Union([Pending, Settled])
export type OperationState = typeof OperationState.Type

export class OperationNotFound extends Schema.TaggedError<OperationNotFound>()('OperationNotFound', {
  id: OperationId,
}) {
  override get message(): string {
    return `no operation is recorded for ${this.id}`
  }
}

export class AlreadySettled extends Schema.TaggedError<AlreadySettled>()('AlreadySettled', {
  state: Settled,
  answer: SettlementAnswer,
}) {
  override get message(): string {
    return 'the operation already settled; a different answer is refused'
  }
}
