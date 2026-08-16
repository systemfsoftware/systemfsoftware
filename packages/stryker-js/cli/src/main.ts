#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import semver from 'semver'

import { strykerEngines } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'

import { OutputModeProbe, OutputModeProbeLive } from './output-mode.adapter.js'
import { RunEventStreamLive, RunEventStreamPort } from './run-event-stream.adapter.js'
import { strykerCliEffect } from './stryker-cli.handler.js'

const EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER = 1

process.title = 'stryker'

if (!semver.satisfies(process.version, strykerEngines.node)) {
  throw new Error(
    `Node.js version ${process.version} detected. StrykerJS requires version to match ${strykerEngines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
  )
}

const resolvedExitCode: { current: number } = { current: EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER }

// The composition root: resolve the two port layers once and pass the members
// the CLI needs down as plain parameters (REPO-A2 — dependency
// parameterization, not a requirement channel).
const program = Effect.gen(function*() {
  const outputMode = yield* OutputModeProbe
  const runEvents = yield* RunEventStreamPort
  return yield* strykerCliEffect(
    // v4's `Command.runWith` takes the arguments after the program name, not
    // the full `process.argv` — argv[0] and argv[1] would parse as an unknown
    // subcommand.
    process.argv.slice(2),
    undefined,
    (code) => {
      resolvedExitCode.current = code
    },
    outputMode.detectMode,
    runEvents.createRunEventStream,
  )
}).pipe(
  Effect.provide(Layer.merge(OutputModeProbeLive, RunEventStreamLive).pipe(Layer.provide(NodeStdio.layer))),
)

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (_exit, onExit) => {
    onExit(resolvedExitCode.current)
  },
})
