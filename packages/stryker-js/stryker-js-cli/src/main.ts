#!/usr/bin/env node
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Option from 'effect/Option'
import cliPkgJson from '../package.json' with { type: 'json' }

import { observeTerminatingSignal } from './Cli.js'
import { strykerCliEffect } from './Cli.js'
import { OutputModeProbe, OutputModeProbeLive } from './Output.js'
import { RunEventStreamPort } from './Output.js'
import { RunEventStreamFileLive } from './StreamFile.js'

const EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER = 1

/** The major version `engines.node` floors the CLI at. */
const SUPPORTED_NODE_MAJOR = 20

process.title = 'stryker'

// Installed before the program starts: a signal that arrives during startup
// still has to reach the teardown below.
const lastSignal = observeTerminatingSignal()

/** The numbers a `process.version` names; a component that does not parse stays `NaN`. */
const versionNumbers = (version: string): readonly number[] =>
  version
    .replace(/^v/, '')
    .split(/[-+]/)
    .slice(0, 1)
    .flatMap((base) => base.split('.'))
    .map((part) => Number.parseInt(part, 10))

const componentAt = (numbers: readonly number[], index: number): number =>
  Option.getOrElse(Option.fromUndefinedOr(numbers[index]), () => 0)

/** Every reason the CLI refuses the running Node.js, checked against the parsed version numbers. */
const NODE_VERSION_REJECTIONS: readonly ((numbers: readonly number[]) => boolean)[] = [
  (numbers) => numbers.some(Number.isNaN),
  (numbers) => componentAt(numbers, 0) < SUPPORTED_NODE_MAJOR,
]

function isSupportedNodeVersion(version: string): boolean {
  const numbers = versionNumbers(version)
  return !NODE_VERSION_REJECTIONS.some((rejects) => rejects(numbers))
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

const publishedExitCode = (exit: Exit.Exit<unknown, unknown>): Option.Option<number> =>
  Option.flatMap(
    Option.liftPredicate(exit, Exit.isSuccess),
    (succeeded) => Option.liftPredicate(succeeded.value, (value): value is number => typeof value === 'number'),
  )

// A signal interrupts the run's fiber, so its exit is a failure however the
// finalizer ended - the classed code it resolved reached the terminal event
// and would die here. The shell is owed `128 + n` for the signal that
// stopped us, which is the same number the terminal event carries.
const signalExitCode = (signal: number | null): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(signal), (stopped) => 128 + stopped),
    () => EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER,
  )

const teardownExitCode = (exit: Exit.Exit<unknown, unknown>, signal: number | null): number =>
  Option.getOrElse(publishedExitCode(exit), () => signalExitCode(signal))

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit: Exit.Exit<unknown, unknown>, onExit) => onExit(teardownExitCode(exit, lastSignal())),
})
