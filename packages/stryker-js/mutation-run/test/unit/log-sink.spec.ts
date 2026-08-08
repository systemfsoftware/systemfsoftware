import { commonTokens } from '@stryker-mutator/api/plugin'
import { noopLogger } from '@stryker-mutator/util'
import { Writable } from 'node:stream'
import { createInjector } from 'typed-inject'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { coreTokens } from '../../src/di/index.js'
import { LogLevel } from '../../src/logging/log-level.js'
import { LoggingBackend } from '../../src/logging/logging-backend.js'
import { LoggingEvent } from '../../src/logging/logging-event.js'
import type { ResolvedMode } from '../../src/output-mode.js'
import {
  DryRunExecutor,
  MutantInstrumenterExecutor,
  MutationTestExecutor,
  PrepareExecutor,
} from '../../src/process/index.js'
import type { RunEventSink, RunPhase } from '../../src/run-event.js'
import { Stryker } from '../../src/stryker.js'

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

function createExecutorFns(): ExecutorFns {
  return {
    prepare: vi.fn(async (): Promise<unknown> => undefined),
    instrument: vi.fn(async (): Promise<unknown> => undefined),
    dryRun: vi.fn(async (): Promise<unknown> => undefined),
    mutationTest: vi.fn(async (): Promise<readonly unknown[]> => []),
  }
}

// Stryker.run drives the executor chain through typed-inject's injectClass;
// intercepting that one seam (the declared dependency port) keeps the phase
// assertions on the emission order instead of on real prepare/instrument work.
function createRunInjector(executorFns: ExecutorFns, sink: RunEventSink) {
  const injector = createInjector()
    .provideValue(commonTokens.getLogger, () => noopLogger)
    .provideValue(commonTokens.logger, noopLogger)
    .provideValue(commonTokens.options, { cleanTempDir: 'always' })
    .provideValue(coreTokens.loggingServerAddress, { port: 0 })
    .provideValue(coreTokens.loggingSink, new LoggingBackend(memoryWritable(), false))
    .provideValue(coreTokens.runEventSink, sink)
    .provideValue(coreTokens.runId, 'fake-run-id')
    .provideValue(coreTokens.resolvedMode, machineResolved)
    .provideValue(coreTokens.progressEnabled, false)
    .provideValue(coreTokens.clearTextEnabled, false)
    .provideValue(coreTokens.runStartedAt, 0)
    .provideValue(coreTokens.reporterPluginModules, [])
  vi.spyOn(injector, 'injectClass').mockImplementation((cls: unknown): unknown => {
    if (cls === PrepareExecutor) {
      return { execute: executorFns.prepare }
    }
    if (cls === MutantInstrumenterExecutor) {
      return { execute: executorFns.instrument }
    }
    if (cls === DryRunExecutor) {
      return { execute: executorFns.dryRun }
    }
    if (cls === MutationTestExecutor) {
      return { execute: executorFns.mutationTest }
    }
    throw new Error(`Unexpected class resolved from the fake injector: ${String(cls)}`)
  })
  return injector
}

describe('the log sink', () => {
  it('defaults its stdout level to Information', () => {
    expect(new LoggingBackend(memoryWritable(), false).activeStdoutLevel).toBe(LogLevel.Information)
  })

  it('writes an info-level log to the writable it was given and no other', () => {
    const given = memoryWritable()
    const other = memoryWritable()
    const backend = new LoggingBackend(given, false)
    backend.log(LoggingEvent.create('Stryker', LogLevel.Information, ['machine-mode diagnostic']))
    expect(given.written()).toContain('machine-mode diagnostic')
    expect(other.written()).toBe('')
  })

  it('honours the colour flag at construction: false emits no escape sequences, true does', () => {
    const plain = memoryWritable()
    new LoggingBackend(plain, false).log(LoggingEvent.create('Stryker', LogLevel.Information, ['plain message']))
    expect(plain.written()).not.toContain('\x1B[')

    const colorized = memoryWritable()
    new LoggingBackend(colorized, true).log(LoggingEvent.create('Stryker', LogLevel.Information, ['colour message']))
    expect(colorized.written()).toContain('\x1B[')
  })
})

describe('the phase events', () => {
  it('emits all four phases in chain order, each before its stage runs', async () => {
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

    await Stryker.run(injector, { cliOptions: {}, targetMutatePatterns: undefined })

    expect(order).toEqual([
      'phase:prepare',
      'exec:prepare',
      'phase:instrument',
      'exec:instrument',
      'phase:dry-run',
      'exec:dry-run',
      'phase:mutation-test',
      'exec:mutation-test',
    ])
  })

  it('has still emitted the prepare phase when PrepareExecutor throws', async () => {
    const phases: RunPhase[] = []
    const executorFns = createExecutorFns()
    const injector = createRunInjector(executorFns, (event) => {
      if (event.kind === 'phase') phases.push(event.phase)
    })
    executorFns.prepare.mockRejectedValueOnce(new Error('prepare exploded'))

    await expect(
      Stryker.run(injector, { cliOptions: {}, targetMutatePatterns: undefined }),
    ).rejects.toThrow('prepare exploded')

    expect(phases).toEqual(['prepare'])
  })
})
