import type { Cause, Effect, Scope } from 'effect'
import type { DaemonHealth, SupervisorHealth } from './DaemonHealth.schema.js'
import type { ChildPolicyConfig } from './DaemonPolicy.schema.js'
import type { SupervisionPolicy } from './DaemonSpec.schema.js'
import type { IntensityTracker } from './internal/Intensity.js'

/** @public */
export interface BootedChild<R> {
  readonly name: string
  readonly health: DaemonHealth | SupervisorHealth
  readonly run: Effect.Effect<void, never, R>
  readonly childPolicy: ChildPolicyConfig
}

/** @public */
export interface SupervisionContext<R> {
  readonly name: string
  readonly booted: readonly BootedChild<R>[]
  readonly health: SupervisorHealth
  readonly policy: SupervisionPolicy
  readonly reportRestart: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>
  readonly reportExhausted: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>
  readonly intensityEff: Effect.Effect<IntensityTracker>
}

/** @public */
export type Supervision<R> = Effect.Effect<
  void,
  never,
  R | Scope.Scope
>
