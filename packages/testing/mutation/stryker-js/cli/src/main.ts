#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'

import { strykerEngines } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'

import { OutputModeProbe, OutputModeProbeLive } from './output-mode-probe.js'
import { RunEventStreamLive, RunEventStreamPort } from './run-event-stream.js'
import { strykerCliEffect } from './stryker-cli.js'

const EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER = 1

process.title = 'stryker'

function isSupportedNodeVersion(version: string): boolean {
  const withoutV = version.startsWith('v') ? version.slice(1) : version
  const dashBase = withoutV.split('-')[0] ?? withoutV
  const base = dashBase.split('+')[0] ?? dashBase
  const parts = base.split('.').map((p) => Number.parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
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
    `Node.js version ${process.version} detected. StrykerJS requires version to match ${strykerEngines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
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
  )
}).pipe(
  // stdout carries the NDJSON protocol and nothing else. Effect's built-in
  // loggers write to stdout by default, which puts a log line in the middle of
  // the stream and makes every consumer's parse fail on it. One reference,
  // provided once at the only interpretation edge, moves them all to stderr.
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(Layer.merge(OutputModeProbeLive, RunEventStreamLive).pipe(Layer.provide(NodeStdio.layer))),
)

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit: Exit.Exit<unknown, unknown>, onExit) => {
    if (Exit.isSuccess(exit) && typeof exit.value === 'number') {
      onExit(exit.value)
    } else {
      onExit(EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER)
    }
  },
})
