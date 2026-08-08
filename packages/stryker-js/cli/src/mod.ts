import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import semver from 'semver'

import { strykerEngines } from '@systemfsoftware/stryker-js-core/stryker-package'

import { OutputModeProbe, OutputModeProbeLive } from './output-mode.adapter.js'
import { RunEventStreamLive, RunEventStreamPort } from './run-event-stream.adapter.js'
import { StrykerCliExecutorDeps } from './stryker-cli.executor.js'
import { strykerCliEffect } from './stryker-cli.handler.js'

const StrykerCliExecutorDepsLive: Layer.Layer<StrykerCliExecutorDeps> = Layer
  .effect(
    StrykerCliExecutorDeps,
    Effect.gen(function*() {
      const outputMode = yield* OutputModeProbe
      const runEvents = yield* RunEventStreamPort
      return {
        detectMode: outputMode.detectMode,
        createRunEventStream: runEvents.createRunEventStream,
      }
    }),
  )
  .pipe(Layer.provide(Layer.merge(OutputModeProbeLive, RunEventStreamLive)))

/**
 * The CLI's process entry, called by `bin/stryker.js`.
 *
 * The executor resolves every outcome — success, typed failure, defect and
 * interruption alike — into the classed exit code as its *value*, so this
 * program cannot fail (`E = never`) and the runtime has nothing left to
 * report; `disableErrorReporting` stops it rendering a second, prose copy of
 * a failure the run already emitted through its own stream.
 */
export function runStrykerCli(argv: string[]): void {
  guardMinimalNodeVersion()

  // `Teardown` receives the exit under an opaque generic, and a signal leaves
  // the fiber interrupted so the run's value never reaches a `tap` or an
  // `onExit` here either. The executor publishes the classed code from inside
  // its own uninterruptible finalizer instead. The 1 stands for a run that
  // never reached that point, which must not report success.
  const resolvedExitCode: { current: number } = { current: 1 }

  const program = strykerCliEffect(argv, undefined, (code) => {
    resolvedExitCode.current = code
  }).pipe(Effect.provide(StrykerCliExecutorDepsLive))

  NodeRuntime.runMain(program, {
    disableErrorReporting: true,
    teardown: (_exit, onExit) => {
      onExit(resolvedExitCode.current)
    },
  })
}

function guardMinimalNodeVersion(processVersion = process.version): void {
  if (!semver.satisfies(processVersion, strykerEngines.node)) {
    throw new Error(
      `Node.js version ${processVersion} detected. StrykerJS requires version to match ${strykerEngines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
    )
  }
}
