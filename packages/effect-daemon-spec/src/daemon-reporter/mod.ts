import { Effect, Layer } from 'effect'
import { SupervisorBodyExecutorDeps } from '../internal/supervisor-body.executor.js'
import { DaemonReporter } from './daemon-reporter.adapter.js'

export { supervisor, SupervisorBodyExecutorDeps } from '../internal/supervisor-body.executor.js'
export { DaemonReporter, Noop } from './daemon-reporter.adapter.js'
export type { DaemonReporterService } from './daemon-reporter.adapter.js'

export const SupervisorBodyExecutorLive: Layer.Layer<
  SupervisorBodyExecutorDeps,
  never,
  DaemonReporter
> = Layer.effect(
  SupervisorBodyExecutorDeps,
  Effect.gen(function*() {
    const reporter = yield* DaemonReporter
    return { onRestart: reporter.onRestart, onExhausted: reporter.onExhausted }
  }),
)
