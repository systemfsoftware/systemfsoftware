import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const RerunDecisionTypeId = Symbol.for('@systemfsoftware/effect-unit-of-work/postgres/RerunDecision')
type RerunDecisionTypeId = typeof RerunDecisionTypeId

export const RerunReason = Schema.Literals([
  'ConnectionError',
  'AuthenticationError',
  'AuthorizationError',
  'SqlSyntaxError',
  'UniqueViolation',
  'ConstraintError',
  'DeadlockError',
  'SerializationError',
  'LockTimeoutError',
  'StatementTimeoutError',
  'UnknownError',
])
export type RerunReason = typeof RerunReason.Type

export class UnitAttempt extends Schema.TaggedClass<UnitAttempt>()('UnitAttempt', {
  reason: RerunReason,
}) {
  static readonly [Workflow.InstrumentationBrand] = { reason: 'uow.unit.reason' } as const
}

export class Rerun extends Schema.TaggedClass<Rerun>()('Rerun', {}) {
  readonly [RerunDecisionTypeId] = RerunDecisionTypeId
}

export class Abandoned extends Schema.TaggedClass<Abandoned>()('Abandoned', {}) {
  readonly [RerunDecisionTypeId] = RerunDecisionTypeId
}

export const RerunDecision = Schema.Union([Rerun, Abandoned])
export type RerunDecision = typeof RerunDecision.Type

const rerun = (): RerunDecision => new Rerun({})
const abandoned = (): RerunDecision => new Abandoned({})

const decideRerun = (reason: RerunReason): RerunDecision =>
  Match.value(reason).pipe(
    Match.when('SerializationError', rerun),
    Match.when('DeadlockError', rerun),
    Match.when('ConnectionError', abandoned),
    Match.when('AuthenticationError', abandoned),
    Match.when('AuthorizationError', abandoned),
    Match.when('SqlSyntaxError', abandoned),
    Match.when('UniqueViolation', abandoned),
    Match.when('ConstraintError', abandoned),
    Match.when('LockTimeoutError', abandoned),
    Match.when('StatementTimeoutError', abandoned),
    Match.when('UnknownError', abandoned),
    Match.exhaustive,
  )

export const rerunUnitOnSerialization = Workflow.make({
  command: UnitAttempt,
  decision: RerunDecision,
  error: Schema.Never,
  decide: (command): Result.Result<RerunDecision, never> => Result.succeed(decideRerun(command.reason)),
})
