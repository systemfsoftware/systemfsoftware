import { Cause, Context, Effect, Exit, Option, Scope } from 'effect'
import type { ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import type { Medium, Started, Stopped } from './Medium.js'

/**
 * A child bound to the medium that interprets its program, and to the services
 * that medium needs (KTD9, R15, R17, R18). Every operation already runs in the
 * context the supervisor acquired, so the handle stores one bound child per
 * declared and dynamic child, and the executor never names a medium.
 */
export interface BoundChild {
  /**
   * Starts one incarnation in a fresh child scope. A medium whose `start` fails
   * produces an abnormal `TerminationReason` instead of a failure, so nothing
   * downstream claims the child started (R15, KTD8).
   */
  readonly start: Effect.Effect<Started, TerminationReason, Scope.Scope>
  readonly report: (evidence: Started) => Effect.Effect<TerminationReason, never, never>
  readonly probe: (evidence: Started) => Effect.Effect<boolean, never, never>
  readonly stop: (evidence: Started, mode: ShutdownMode) => Effect.Effect<Stopped, never, never>
}

const rendered = <Failure>(failure: Failure): TerminationReason => ({
  _tag: 'Abnormal',
  report: { _tag: 'CauseReport', cause: Cause.pretty(Cause.fail(failure)) },
})

const reasonOf = (cause: Cause.Cause<TerminationReason>): TerminationReason =>
  Option.getOrElse(Cause.findErrorOption(cause), () => ({
    _tag: 'Abnormal',
    report: { _tag: 'CauseReport', cause: Cause.pretty(cause) },
  }))

const startOf = <Program, StartError, R>(
  program: Program,
  medium: Medium<Program, StartError, R>,
  context: Context.Context<R>,
): Effect.Effect<Started, TerminationReason, Scope.Scope> =>
  Effect.gen(function*() {
    const parent = yield* Effect.scope
    const child = yield* Scope.fork(parent)
    const scoped = Context.add(context, Scope.Scope, child)
    const outcome = yield* Effect.exit(
      Effect.setContext(Effect.mapError(medium.start(program), rendered<StartError>), scoped),
    )
    return yield* Exit.match(outcome, {
      onSuccess: (evidence) => Effect.succeed(evidence),
      onFailure: (cause) => Effect.andThen(Scope.close(child, Exit.void), Effect.fail(reasonOf(cause))),
    })
  })

const bind = <Program, StartError, R>(
  program: Program,
  medium: Medium<Program, StartError, R>,
  context: Context.Context<R>,
): BoundChild => ({
  start: startOf(program, medium, context),
  report: (evidence) => Effect.setContext(medium.report(evidence), context),
  probe: (evidence) => Effect.setContext(medium.probe(evidence), context),
  stop: (evidence, mode) => Effect.setContext(medium.stop(evidence, mode), context),
})

/**
 * Binds a program to the medium that interprets it, capturing the services
 * resolved at acquisition: the medium's own requirements are read from
 * `context` once, and `start` forks a fresh child scope so closing that scope
 * owns the child's shutdown (KTD9).
 */
export const Binder = { bind } as const
