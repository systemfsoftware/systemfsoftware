import { Duration, Match, Schema } from 'effect'
import type { ChildProcess } from 'effect/unstable/process'

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

export const killOptionsOf = (decision: KillSignalDecision): ChildProcess.KillOptions =>
  Match.value(decision).pipe(
    Match.tag('BrutalKill', (): ChildProcess.KillOptions => ({ killSignal: 'SIGKILL' })),
    Match.tag('GracefulKill', (graceful): ChildProcess.KillOptions => ({
      killSignal: 'SIGTERM',
      forceKillAfter: Duration.millis(graceful.forceKillAfterMillis),
    })),
    Match.tag('PatientKill', (): ChildProcess.KillOptions => ({ killSignal: 'SIGTERM' })),
    Match.exhaustive,
  )
