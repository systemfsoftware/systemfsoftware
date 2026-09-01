#!/usr/bin/env node
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import cliPkgJson from '../package.json' with { type: 'json' }

import { observeTerminatingSignal } from './Cli.js'
import { strykerCliEffect } from './Cli.js'
import { OutputModeProbe, OutputModeProbeLive } from './Output.js'
import { RunEventStreamPort } from './Output.js'
import { RunEventStreamFileLive } from './StreamFile.js'

const EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER = 1

process.title = 'stryker'

// Installed before the program starts: a signal that arrives during startup
// still has to reach the teardown below.
const lastSignal = observeTerminatingSignal()

function isSupportedNodeVersion(version: string): boolean {
  const base = version.replace(/^v/, '').split(/[-+]/)[0] ?? ''
  const [major = 0, minor = 0, patch = 0] = base.split('.').map((p) => Number.parseInt(p, 10))
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return false
  }
  if (major !== 20) {
    return major > 20
  }
  if (minor !== 0) {
    return minor > 0
  }
  return patch >= 0
}

if (!isSupportedNodeVersion(process.version)) {
  throw new Error(
    `Node.js version ${process.version} detected. StrykerJS requires version to match ${cliPkgJson.engines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
  )
}

const program = Effect.gen(function*() {
  const outputMode = yield* OutputModeProbe
  const runEvents = yield* RunEventStreamPort
  return yield* strykerCliEffect(
    process.argv.slice(2),
    undefined,
    outputMode.detectMode,
    runEvents.createRunEventStream,
    lastSignal,
  )
}).pipe(
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(
    Layer.merge(OutputModeProbeLive, RunEventStreamFileLive).pipe(
      Layer.provide(Layer.mergeAll(NodeStdio.layer, NodeFileSystem.layer, NodePath.layer)),
    ),
  ),
)

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit: Exit.Exit<unknown, unknown>, onExit) => {
    if (Exit.isSuccess(exit) && typeof exit.value === 'number') {
      onExit(exit.value)
      return
    }
    // A signal interrupts the run's fiber, so its exit is a failure however the
    // finalizer ended - the classed code it resolved reached the terminal event
    // and would die here. The shell is owed `128 + n` for the signal that
    // stopped us, which is the same number the terminal event carries.
    const signal = lastSignal()
    if (signal === null) {
      onExit(EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER)
    } else {
      onExit(128 + signal)
    }
  },
})
