import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const KillSignalDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-process/KillSignalDecision',
)
type KillSignalDecisionTypeId = typeof KillSignalDecisionTypeId

export class BrutalKill extends Schema.TaggedClass<BrutalKill>()('BrutalKill', {}) {
  readonly [KillSignalDecisionTypeId] = KillSignalDecisionTypeId
}

export class GracefulKill extends Schema.TaggedClass<GracefulKill>()('GracefulKill', {
  forceKillAfterMillis: Schema.Int,
}) {
  readonly [KillSignalDecisionTypeId] = KillSignalDecisionTypeId
}

export class PatientKill extends Schema.TaggedClass<PatientKill>()('PatientKill', {}) {
  readonly [KillSignalDecisionTypeId] = KillSignalDecisionTypeId
}

export const KillSignalDecision = Schema.Union([BrutalKill, GracefulKill, PatientKill])
export type KillSignalDecision = typeof KillSignalDecision.Type

export class SelectKillSignals extends Schema.TaggedClass<SelectKillSignals>()('SelectKillSignals', {
  mode: Supervisor.Medium.ShutdownMode,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decideKillSignals = (command: SelectKillSignals): Result.Result<KillSignalDecision, never> =>
  Result.succeed(
    Match.value(command.mode).pipe(
      Match.tag('Brutal', (): KillSignalDecision => new BrutalKill({})),
      Match.tag(
        'Graceful',
        (graceful): KillSignalDecision => new GracefulKill({ forceKillAfterMillis: graceful.millis }),
      ),
      Match.tag('Infinity', (): KillSignalDecision => new PatientKill({})),
      Match.exhaustive,
    ),
  )

export const selectKillSignals = Workflow.make({
  command: SelectKillSignals,
  decision: KillSignalDecision,
  error: Schema.Never,
  decide: decideKillSignals,
})
