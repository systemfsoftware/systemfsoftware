import type { Cause, Effect, Scope } from 'effect'
import type { DaemonHealth, SupervisorHealth } from './daemon-health.schema.js'
import type { ChildPolicyConfig } from './daemon-policy.schema.js'
import type { SupervisionPolicy } from './daemon-spec.schema.js'
import type { IntensityTracker } from './internal/intensity.kernel.js'
import type { SupervisorBodyExecutorDeps } from './internal/supervisor-body.executor.js'

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
  readonly reportRestart: (cause: Cause.Cause<never>) => Effect.Effect<void, never, SupervisorBodyExecutorDeps>
  readonly reportExhausted: (cause: Cause.Cause<never>) => Effect.Effect<void, never, SupervisorBodyExecutorDeps>
  readonly intensityEff: Effect.Effect<IntensityTracker>
}

export type Supervision<R> = Effect.Effect<
  void,
  never,
  R | SupervisorBodyExecutorDeps | Scope.Scope
>
