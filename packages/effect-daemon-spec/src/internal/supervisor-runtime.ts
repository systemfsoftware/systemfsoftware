import type { Cause, Scope } from 'effect'
import { Effect, Metric, Option } from 'effect'
import type { SupervisorHealth } from '../daemon-health.js'
import { supervisorExhaustionsCounter, supervisorRestartsCounter } from '../daemon-metrics.js'
import { DaemonReporter } from '../daemon-reporter.js'
import type { Supervisor } from '../daemon-spec.js'
import type { BootedChild } from './boot.js'
import { make as makeIntensity } from './intensity.js'
import { superviseTree } from './supervise-tree.strategy.js'

export const buildSupervisorBody = <E, R>(
  sup: Supervisor<E, R>,
  health: SupervisorHealth,
  booted: ReadonlyArray<BootedChild<R | DaemonReporter | Scope.Scope>>,
): Effect.Effect<void, never, R | DaemonReporter | Scope.Scope> =>
  Effect.gen(function*() {
    const policy = yield* sup.supervision
    const intensityEff = makeIntensity(policy.intensity)

    const reportRestart = (cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const reporter = yield* DaemonReporter
        yield* Metric.increment(Metric.tagged(supervisorRestartsCounter, 'supervisor', sup.name))
        yield* reporter.onRestart(sup.name, cause)
        yield* Option.match(Option.fromNullable(sup.reporter.onRestart), {
          onNone: () => Effect.void,
          onSome: (fn) => fn(cause),
        })
      })

    const reportExhausted = (cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const reporter = yield* DaemonReporter
        yield* Metric.increment(Metric.tagged(supervisorExhaustionsCounter, 'supervisor', sup.name))
        yield* reporter.onExhausted(sup.name, cause)
        yield* Option.match(Option.fromNullable(sup.reporter.onExhausted), {
          onNone: () => Effect.void,
          onSome: (fn) => fn(cause),
        })
      })

    const runStrategy = superviseTree<R | DaemonReporter | Scope.Scope>(sup.strategy, {
      name: sup.name,
      booted,
      health,
      policy,
      reportRestart,
      reportExhausted,
      intensityEff,
    })

    yield* Effect.andThen(health.paused.await, runStrategy)
  })
