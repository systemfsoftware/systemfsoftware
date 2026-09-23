import { Effect, Predicate, Schedule } from 'effect'
import { dual } from 'effect/Function'
import { probeConditionCell } from './await-condition.cell.js'
import { AwaitCondition } from './AwaitCondition.schema.js'
import type { Condition } from './Condition.schema.js'
import { Satisfied } from './evaluate-probe.workflow.js'
import type { HostProber } from './host-prober.service.js'
import type { LogSource } from './log-source.service.js'
import type { PortBinding } from './Port.schema.js'
import type { ProbeTarget } from './ProbeTarget.schema.js'
import type { LogSourceError, ProbeInputInvalid } from './ReadinessError.schema.js'
import { TimedOut } from './verdict.schema.js'

export const Wait = {
  forTcp: (guestPort: number): Condition => ({ _tag: 'Tcp', guestPort }),
  forHttp: (path: string, guestPort: number): Condition => ({ _tag: 'Http', guestPort, path }),
  forLog: (pattern: string): Condition => ({ _tag: 'Log', pattern }),
}

export interface TargetOptions {
  readonly timeoutMs?: number
  readonly pollMs?: number
}

const DEFAULTS = { timeoutMs: 30_000, pollMs: 250 } as const

export const target = (bindings: ReadonlyArray<PortBinding>, options: TargetOptions = {}): ProbeTarget => ({
  ...DEFAULTS,
  ...options,
  bindings,
})

export const awaitCondition: {
  (
    target: ProbeTarget,
    condition: Condition,
  ): Effect.Effect<Satisfied | TimedOut, LogSourceError | ProbeInputInvalid, HostProber | LogSource>
  (
    condition: Condition,
  ): (target: ProbeTarget) => Effect.Effect<
    Satisfied | TimedOut,
    LogSourceError | ProbeInputInvalid,
    HostProber | LogSource
  >
} = dual(
  2,
  (probeTarget: ProbeTarget, condition: Condition) =>
    probeConditionCell.run(new AwaitCondition({ target: probeTarget, condition })).pipe(
      Effect.repeat({
        schedule: Schedule.spaced(`${probeTarget.pollMs} millis`),
        until: Predicate.isTagged('Satisfied'),
      }),
      Effect.as(new Satisfied({})),
      Effect.timeoutOrElse({
        duration: `${probeTarget.timeoutMs} millis`,
        orElse: () => Effect.succeed(new TimedOut({})),
      }),
    ),
)
