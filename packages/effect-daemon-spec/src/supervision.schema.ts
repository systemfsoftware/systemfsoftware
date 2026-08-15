import type { Cause, Effect, Scope } from 'effect'
import type { DaemonHealth, SupervisorHealth } from './daemon-health.schema.js'
import type { ChildPolicyConfig } from './daemon-policy.schema.js'
import type { SupervisionPolicy } from './daemon-spec.schema.js'
import type { IntensityTracker } from './internal/intensity.kernel.js'

export interface BootedChild<R> {
  readonly name: string
  readonly health: DaemonHealth | SupervisorHealth
  readonly run: Effect.Effect<void, never, R>
  readonly childPolicy: ChildPolicyConfig
}

export interface SupervisionContext<R> {
  readonly name: string
  readonly booted: readonly BootedChild<R>[]
  readonly health: SupervisorHealth
  readonly policy: SupervisionPolicy
  readonly reportRestart: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>
  readonly reportExhausted: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>
  readonly intensityEff: Effect.Effect<IntensityTracker>
}

export type Supervision<R> = Effect.Effect<
  void,
  never,
  R | Scope.Scope
>
