import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { BrutalKill, GracefulKill, KillSignalDecision, PatientKill } from './KillSignalDecision.schema.js'

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
