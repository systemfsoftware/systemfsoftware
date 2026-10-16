import { Cause, Context, Effect, Exit, Scope } from 'effect'
import type { ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import { abnormalReasonOfCause, terminationReasonOfCause } from '../kernel/TerminationReport.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import type { Medium, Started, Stopped } from './Medium.js'

export interface Incarnation {
  readonly evidence: Started
  readonly scope: Scope.Closeable
}

export interface BoundChild {
  readonly start: Effect.Effect<Incarnation, TerminationReason, Scope.Scope>
  readonly report: (incarnation: Incarnation) => Effect.Effect<TerminationReason, never, never>
  readonly probe: (incarnation: Incarnation) => Effect.Effect<boolean, never, never>
  readonly stop: (incarnation: Incarnation, mode: ShutdownMode) => Effect.Effect<Stopped, never, never>
}

const rendered = <Failure>(failure: Failure): TerminationReason => abnormalReasonOfCause(Cause.fail(failure))

const startOf = <Program, StartError, R>(
  program: Program,
  medium: Medium<Program, StartError, R>,
  context: Context.Context<R>,
): Effect.Effect<Incarnation, TerminationReason, Scope.Scope> =>
  Effect.gen(function*() {
    const parent = yield* Effect.scope
    const child = yield* Scope.fork(parent)
    const scoped = Context.add(context, Scope.Scope, child)
    const outcome = yield* Effect.exit(
      Effect.setContext(Effect.mapError(medium.start(program), rendered<StartError>), scoped),
    )
    return yield* Exit.match(outcome, {
      onSuccess: (evidence): Effect.Effect<Incarnation, TerminationReason> =>
        Effect.succeed({ evidence, scope: child }),
      onFailure: (cause) => Effect.andThen(Scope.close(child, Exit.void), Effect.fail(terminationReasonOfCause(cause))),
    })
  })

const bind = <Program, StartError, R>(
  program: Program,
  medium: Medium<Program, StartError, R>,
  context: Context.Context<R>,
): BoundChild => ({
  start: startOf(program, medium, context),
  report: (incarnation) => Effect.setContext(medium.report(incarnation.evidence), context),
  probe: (incarnation) => Effect.setContext(medium.probe(incarnation.evidence), context),
  stop: (incarnation, mode) =>
    Effect.ensuring(
      Effect.setContext(medium.stop(incarnation.evidence, mode), context),
      Scope.close(incarnation.scope, Exit.void),
    ),
})

export const Binder = { bind } as const
