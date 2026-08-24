import { resolve as resolvePath } from 'node:path'

import {
  defaultStages,
  makeRunLayer,
  type RunEnvironmentShape,
  runMutationTest,
} from '@systemfsoftware/stryker-js-mutation-run'
import { resolveExitCode } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import type { ExitClass } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'

import type {
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
} from '@systemfsoftware/stryker-js-mutation-run/errors'
import type { SchemaError } from 'effect/Schema'
import { isExitClass, resolveCliExitCode } from './cli-exit-code.kernel.js'
import { emitMachineModeOutput } from './cli-machine-output.js'
import type { CreateRunEventStreamCapability, RunStrykerCliInput, StrykerRun } from './cli-ports.js'
import type { CliRequest } from './cli-request.schema.js'
import { runSurvivorsAdmission } from './cli-survivors-admission.js'
import { isColorEnabled } from './output-mode.js'
import type { RunEventStream } from './run-event-stream.js'
import { SurvivorsRejection } from './survivors-admission.workflow.js'

const defaultRunMutationTest = (hostOptions: RunEnvironmentShape): StrykerRun => (options) =>
  Effect.scoped(runMutationTest(defaultStages, options)).pipe(Effect.provide(makeRunLayer(hostOptions)))

/**
 * The host options a run is bound to: the sink, the mode, the timing and the
 * log descriptor chosen by the mode — machine mode keeps stdout exclusively
 * for the NDJSON stream, so the logging backend is pointed at stderr; human
 * mode keeps the stdout sink. The fix is the descriptor, never the log level.
 */
function hostOptionsOf(mode: ResolvedMode, stream: RunEventStream): RunEnvironmentShape {
  return {
    runEventSink: stream.sink,
    runId: stream.runId,
    resolvedMode: mode,
    runStartedAt: stream.startedAt,
    basePath: resolvePath(process.cwd()),
    reporterPluginModules: [
      import.meta.resolve('@systemfsoftware/stryker-js-mutation-report/stryker-plugins'),
    ],
    logSink: (line: string): void => {
      if (mode.mode === 'human') {
        process.stdout.write(line)
      } else {
        process.stderr.write(line)
      }
    },
    allowConsoleColors: isColorEnabled(mode, process.env['NO_COLOR']),
  }
}

/**
 * The single operation of the CLI's run cell: the impure shell that
 * wraps the transport's command effect with the run bootstrap. It creates the
 * run's stream from the resolved mode, binds the host options a run is
 * executed with, opens the stream, runs the command effect, dispatches the
 * request the handlers left, and on every outcome — success, failure and
 * interruption alike — emits the machine-mode terminal event (error/help/
 * null verdict) and drains the stream, returning the classed exit code as its
 * value. SIGINT/SIGTERM interrupt the current fiber so the finalizer runs
 * before the process exits; the code is resolved exactly once (R6), in the
 * finalizer, where the terminal event's `code` is chosen from the same inputs
 * the teardown used before.
 */
export const runStrykerCli = (
  input: RunStrykerCliInput,
  createRunEventStream: CreateRunEventStreamCapability,
): Effect.Effect<number, never, never> =>
  Effect.gen(function*() {
    const stream = yield* createRunEventStream(input.mode)
    const hostOptions = hostOptionsOf(input.mode, stream)
    const runMutationTestImpl = input.runMutationTest ?? defaultRunMutationTest(hostOptions)
    const basePath = hostOptions.basePath

    let currentFiber: Fiber.Fiber<unknown, unknown> | null = null

    const verdictOf = (value: unknown): readonly ExitClass[] => {
      if (!Predicate.hasProperty(value, 'verdict')) {
        return []
      }
      const candidate = value.verdict
      if (typeof candidate !== 'number' || !isExitClass(candidate)) {
        return []
      }
      return [candidate]
    }

    const resolveClassedExitCode = (exit: Exit.Exit<unknown, unknown>): number => {
      const signal = input.lastSignal()
      if (signal !== null) {
        return 128 + signal
      }
      if (Exit.isFailure(exit)) {
        return resolveCliExitCode(exit)
      }
      return resolveExitCode(verdictOf(exit.value), null)
    }

    // The signal itself is observed at the process edge and read back through
    // `input.lastSignal`; this handler exists to stop the run, not to decode it.
    const onSignal = (): void => {
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      if (currentFiber !== null) {
        currentFiber.interruptUnsafe(currentFiber.id)
      }
    }

    const dispatch = (
      request: CliRequest,
    ): Effect.Effect<
      unknown,
      SchemaError | SurvivorsRejection | ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
      never
    > =>
      Match.value(request).pipe(
        Match.tag('run', (runRequest) =>
          runRequest.survivors
            ? runSurvivorsAdmission(runMutationTestImpl, stream, input.mode, runRequest.options, basePath).pipe(
              Effect.provide(makeRunLayer(hostOptions)),
            )
            : runMutationTestImpl(runRequest.options).pipe(Effect.orDie)),
        Match.tag('llms', (llmsRequest) =>
          Effect.sync(() => {
            stream.ensureOpen({ mode: 'machine', signal: 'flag', stdoutIsTTY: process.stdout.isTTY === true })
            stream.sink(llmsRequest.document)
          })),
        Match.orElse(() => Effect.die('unreachable cli request variant')),
      )

    const program = Effect.acquireUseRelease(
      Effect.sync(() => {
        currentFiber = Fiber.getCurrent() ?? null
        process.on('SIGINT', onSignal)
        process.on('SIGTERM', onSignal)
      }),
      () =>
        Effect.gen(function*() {
          yield* stream.open
          yield* input.program
          const request = yield* Ref.get(input.requestRef)
          // The dispatched value is the run's outcome, and its verdict is what
          // `resolveClassedExitCode` reads. Yielding without returning it made
          // this block evaluate to `undefined`, so a run under its own breaking
          // threshold reported a score and still exited 0.
          return yield* Option.match(request, {
            onNone: () => Effect.void,
            onSome: (cliRequest) => dispatch(cliRequest),
          })
        }),
      () =>
        Effect.sync(() => {
          process.removeListener('SIGINT', onSignal)
          process.removeListener('SIGTERM', onSignal)
        }),
    )

    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(restore(program))
        const code = resolveClassedExitCode(exit)
        if (input.mode.mode === 'machine') {
          yield* emitMachineModeOutput(stream, input.mode, exit, code, input.argv, basePath)
        }
        yield* stream.closeAndDrain
        return code
      })
    )
  })
