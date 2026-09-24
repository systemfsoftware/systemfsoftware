import { Resource } from '@systemfsoftware/effect-cell-types'
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

export const TypeId = Symbol.for('~systemfsoftware/effect-readiness/ProbeTarget')
export type TypeId = typeof TypeId

const probe = (
  spec: ProbeTarget,
  condition: Condition,
): Effect.Effect<Satisfied | TimedOut, LogSourceError | ProbeInputInvalid, HostProber | LogSource> =>
  probeConditionCell.run(new AwaitCondition({ target: spec, condition })).pipe(
    Effect.repeat({
      schedule: Schedule.spaced(`${spec.pollMs} millis`),
      until: Predicate.isTagged('Satisfied'),
    }),
    Effect.as(new Satisfied({})),
    Effect.timeoutOrElse({
      duration: `${spec.timeoutMs} millis`,
      orElse: () => Effect.succeed(new TimedOut({})),
    }),
  )

const ProbeTargets = Resource.make<ProbeTarget>()({
  typeId: TypeId,
  combinators: {
    withTimeout: (spec, timeoutMs: number): ProbeTarget => ({ ...spec, timeoutMs }),
    withPoll: (spec, pollMs: number): ProbeTarget => ({ ...spec, pollMs }),
  },
  projections: {
    awaitCondition: (spec) => (condition: Condition) => probe(spec, condition),
  },
})

export type ProbeTargetResource = Resource.Of<typeof ProbeTargets>

export const isTarget = ProbeTargets.is

export const withTimeout = ProbeTargets.combinators.withTimeout

export const withPoll = ProbeTargets.combinators.withPoll

export const target: {
  (options?: TargetOptions): (bindings: ReadonlyArray<PortBinding>) => ProbeTargetResource
  (bindings: ReadonlyArray<PortBinding>, options?: TargetOptions): ProbeTargetResource
} = dual(
  (args) => Array.isArray(args[0]),
  (bindings: ReadonlyArray<PortBinding>, options?: TargetOptions): ProbeTargetResource =>
    ProbeTargets.of({ ...DEFAULTS, ...options, bindings }),
)
