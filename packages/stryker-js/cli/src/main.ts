#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import semver from 'semver'

import { strykerEngines } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'

import { OutputModeProbe, OutputModeProbeLive } from './output-mode.adapter.js'
import { RunEventStreamLive, RunEventStreamPort } from './run-event-stream.adapter.js'
import { StrykerCliExecutorDeps } from './stryker-cli.executor.js'
import { strykerCliEffect } from './stryker-cli.handler.js'

const EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER = 1

process.title = 'stryker'

if (!semver.satisfies(process.version, strykerEngines.node)) {
  throw new Error(
    `Node.js version ${process.version} detected. StrykerJS requires version to match ${strykerEngines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
  )
}

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

const resolvedExitCode: { current: number } = { current: EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER }

const program = strykerCliEffect(process.argv, undefined, (code) => {
  resolvedExitCode.current = code
}).pipe(Effect.provide(StrykerCliExecutorDepsLive))

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (_exit, onExit) => {
    onExit(resolvedExitCode.current)
  },
})
