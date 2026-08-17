/**
 * The logging sink and the phase-event stream: a LoggingBackend writes
 * info-level diagnostics to the console it is given and honours its colour
 * flag, and the Stryker run emits each phase event before its stage runs —
 * including when the stage throws.
 */
import { noopLogger } from '@stryker-mutator/util'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Effect } from 'effect'
import { Writable } from 'node:stream'
import { createInjector } from 'typed-inject'
import { expect, vi } from 'vitest'
import type { Mock } from 'vitest'

import { LogLevel } from '../src/logging/log-level.js'
import { LoggingBackend } from '../src/logging/logging-backend.js'
import { LoggingEvent } from '../src/logging/logging-event.js'
import type { ResolvedMode } from '../src/output-mode.js'
import { injectionTokens } from '../src/plugins/index.js'
import type { RunEventSink, RunPhase } from '../src/run-event.js'
import {
  DryRunExecutor,
  MutantInstrumenterExecutor,
  MutationTestExecutor,
  PrepareExecutor,
} from '../src/run-stages/index.js'
import { Stryker } from '../src/stryker.js'

const Feature = makeFeature({ it, layer })

const machineResolved: ResolvedMode = { mode: 'machine', signal: 'tty', stdoutIsTTY: false }

const memoryWritable = (): NodeJS.WritableStream & { written(): string } => {
  const chunks: Buffer[] = []
  const writable = new Writable({
    write: (chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
      chunks.push(Buffer.from(String(chunk)))
      callback()
    },
  })
  return Object.assign(writable, { written: () => Buffer.concat(chunks).toString('utf8') })
}

interface ExecutorFns {
  prepare: Mock<() => Promise<unknown>>
  instrument: Mock<() => Promise<unknown>>
  dryRun: Mock<() => Promise<unknown>>
  mutationTest: Mock<() => Promise<readonly unknown[]>>
}

const createExecutorFns = (): ExecutorFns => ({
  prepare: vi.fn<() => Promise<unknown>>(async () => undefined),
  instrument: vi.fn<() => Promise<unknown>>(async () => undefined),
  dryRun: vi.fn<() => Promise<unknown>>(async () => undefined),
  mutationTest: vi.fn<() => Promise<readonly unknown[]>>(async () => []),
})

// Stryker.run drives the executor chain through typed-inject's injectClass;
// intercepting that one seam (the declared dependency port) keeps the phase
// assertions on the emission order instead of on real prepare/instrument work.
function createRunInjector(executorFns: ExecutorFns, sink: RunEventSink) {
  const injector = createInjector()
    .provideValue(commonTokens.getLogger, () => noopLogger)
    .provideValue(commonTokens.logger, noopLogger)
    .provideValue(commonTokens.options, { cleanTempDir: 'always' })
    .provideValue(injectionTokens.loggingServerAddress, { port: 0 })
    .provideValue(injectionTokens.loggingSink, new LoggingBackend(memoryWritable(), false))
    .provideValue(injectionTokens.runEventSink, sink)
    .provideValue(injectionTokens.runId, 'fake-run-id')
    .provideValue(injectionTokens.resolvedMode, machineResolved)
    .provideValue(injectionTokens.progressEnabled, false)
    .provideValue(injectionTokens.clearTextEnabled, false)
    .provideValue(injectionTokens.runStartedAt, 0)
    .provideValue(injectionTokens.reporterPluginModules, [])
  const executorOf = (cls: unknown): { execute: Mock } => {
    if (cls === PrepareExecutor) return { execute: executorFns.prepare }
    if (cls === MutantInstrumenterExecutor) return { execute: executorFns.instrument }
    if (cls === DryRunExecutor) return { execute: executorFns.dryRun }
    if (cls === MutationTestExecutor) return { execute: executorFns.mutationTest }
    throw new Error(`Unexpected class resolved from the fake injector: ${String(cls)}`)
  }
  // The four executors are the full chain Stryker.run can ask for; the spy
  // returns the corresponding fake executor for each.
  vi.spyOn(injector, 'injectClass').mockImplementation((cls: unknown) => executorOf(cls))
  return injector
}

Feature('The logging sink and the phase event stream')
  .body(({ scenario }) => {
    scenario(
      'Should_WriteAnInfoLogToTheGivenWritableAndNoOther',
      Gherkin.Do.pipe(
        Given('a backend over one writable and nothing else')(
          'writables',
          () =>
            Effect.sync(() => ({
              given: memoryWritable(),
              other: memoryWritable(),
            })),
        ),
        When('an info-level event is logged')('writables', (s) =>
          Effect.sync(() => {
            const backend = new LoggingBackend(s.writables.given, false)
            backend.log(LoggingEvent.create('Stryker', LogLevel.Information, ['machine-mode diagnostic']))
            return s.writables
          })),
        Then('the diagnostic reaches the given writable and no other')((s) => {
          expect(s.writables.given.written()).toContain('machine-mode diagnostic')
          expect(s.writables.other.written()).toBe('')
        }),
      ),
    )

    scenario(
      'Should_KeepColourOut_When_ColoursAreOff',
      Gherkin.Do.pipe(
        Given('a plain backend')('plain', () => Effect.succeed(memoryWritable())),
        When('a message is logged')('written', (s) =>
          Effect.sync(() => {
            new LoggingBackend(s.plain, false).log(
              LoggingEvent.create('Stryker', LogLevel.Information, ['plain message']),
            )
            return s.plain.written()
          })),
        Then('no escape sequence appears')((s) => {
          expect(s.written).not.toContain('\x1B[')
        }),
      ),
    )

    scenario(
      'Should_AroundColourCode_When_ColoursAreOn',
      Gherkin.Do.pipe(
        Given('a colourised backend')('colorized', () => Effect.succeed(memoryWritable())),
        When('a message is logged')('written', (s) =>
          Effect.sync(() => {
            new LoggingBackend(s.colorized, true).log(
              LoggingEvent.create('Stryker', LogLevel.Information, ['colour message']),
            )
            return s.colorized.written()
          })),
        Then('an escape sequence marks the colour')((s) => {
          expect(s.written).toContain('\x1B[')
        }),
      ),
    )

    scenario(
      'Should_EmitFourPhasesInChainOrder_When_RunningTheExecutorChain',
      Gherkin.Do.pipe(
        Given('a fake injector driving the four executors')(
          'order',
          () =>
            Effect.gen(function*() {
              const order: string[] = []
              const executorFns = createExecutorFns()
              const injector = createRunInjector(executorFns, (event) => {
                if (event.kind === 'phase') order.push(`phase:${event.phase}`)
              })
              executorFns.prepare.mockImplementation(async () => {
                order.push('exec:prepare')
                return injector
              })
              executorFns.instrument.mockImplementation(async () => {
                order.push('exec:instrument')
                return injector
              })
              executorFns.dryRun.mockImplementation(async () => {
                order.push('exec:dry-run')
                return injector
              })
              executorFns.mutationTest.mockImplementation(async () => {
                order.push('exec:mutation-test')
                return []
              })
              yield* Effect.promise(() => Stryker.run(injector, { cliOptions: {}, targetMutatePatterns: undefined }))
              return order
            }),
        ),
        Then('every phase precedes its stage')((s) => {
          expect(s.order).toEqual([
            'phase:prepare',
            'exec:prepare',
            'phase:instrument',
            'exec:instrument',
            'phase:dry-run',
            'exec:dry-run',
            'phase:mutation-test',
            'exec:mutation-test',
          ])
        }),
      ),
    )

    scenario(
      'Should_HaveEmittedThePreparePhase_When_PrepareThrows',
      Gherkin.Do.pipe(
        Given('a prepare that explodes and a phase-recording sink')(
          'lane',
          () =>
            Effect.gen(function*() {
              const phases: RunPhase[] = []
              const executorFns = createExecutorFns()
              const injector = createRunInjector(executorFns, (event) => {
                if (event.kind === 'phase') phases.push(event.phase)
              })
              executorFns.prepare.mockRejectedValueOnce(new Error('prepare exploded'))
              const failure = yield* Effect.promise(() =>
                Stryker.run(injector, { cliOptions: {}, targetMutatePatterns: undefined }).then(
                  () => undefined,
                  (error: unknown) => error,
                )
              )
              return { failure, phases }
            }),
        ),
        Then('the run fails and the prepare phase was still recorded')((s) => {
          expect(s.lane.failure).toBeInstanceOf(Error)
          expect(String(s.lane.failure)).toContain('prepare exploded')
          expect(s.lane.phases).toEqual(['prepare'])
        }),
      ),
    )
  })
