import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const IdleTtlDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/IdleTtlDecision',
)
type IdleTtlDecisionTypeId = typeof IdleTtlDecisionTypeId

export class SweepsAfterIdle extends Schema.TaggedClass<SweepsAfterIdle>()('SweepsAfterIdle', {}) {
  readonly [IdleTtlDecisionTypeId] = IdleTtlDecisionTypeId
}

export class NoIdleSweep extends Schema.TaggedClass<NoIdleSweep>()('NoIdleSweep', {}) {
  readonly [IdleTtlDecisionTypeId] = IdleTtlDecisionTypeId
}

export const IdleTtlDecision = Schema.Union([SweepsAfterIdle, NoIdleSweep])
export type IdleTtlDecision = typeof IdleTtlDecision.Type

export class JudgeIdleTtl extends Schema.TaggedClass<JudgeIdleTtl>()('JudgeIdleTtl', {
  keepAlive: Schema.Boolean,
  idleTtlSet: Schema.Boolean,
  idleTtlZero: Schema.Boolean,
  defaultIdleTtlSet: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const sweeps = (command: JudgeIdleTtl): boolean =>
  Match.value([command.keepAlive, command.idleTtlZero].includes(true)).pipe(
    Match.when(true, () => false),
    Match.when(false, () => [command.idleTtlSet, command.defaultIdleTtlSet].includes(true)),
    Match.exhaustive,
  )

export const judgeIdleTtl = Workflow.make({
  command: JudgeIdleTtl,
  decision: IdleTtlDecision,
  error: Schema.Never,
  decide: (command): Result.Result<IdleTtlDecision, never> =>
    Result.succeed(
      Match.value(sweeps(command)).pipe(
        Match.when(true, () => SweepsAfterIdle.make({})),
        Match.when(false, () => NoIdleSweep.make({})),
        Match.exhaustive,
      ),
    ),
})
