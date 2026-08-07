import { commonTokens } from '@stryker-mutator/api/plugin'
import { createInjector, Injector } from 'typed-inject'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

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
import { Stryker } from '../../src/stryker.js'

// The stream module (U7) owns the mode gate and the descriptor; stryker.ts
// only calls into it. This double stands in for that module with the frozen
// contract: configureStream enables machine mode, emitPhase records only
// while machine mode is enabled, and a human or unconfigured stream emits
// nothing. __state exposes the recorded phases to the assertions.
const streamMocks = vi.hoisted(() => {
  const state = {
    machineEnabled: false,
    emittedPhases: [] as string[],
  }
  return {
    STREAM_SCHEMA_VERSION: '1.0',
    TICK_INTERVAL_MS: 10_000,
    configureStream: vi.fn((resolved: { mode: string }, _runId: string): void => {
      state.machineEnabled = resolved.mode === 'machine'
    }),
    streamRunId: vi.fn((): string => 'fake-run-id'),
    isStreamEnabled: vi.fn((): boolean => state.machineEnabled),
    emitPhase: vi.fn((phase: string): void => {
      if (state.machineEnabled) {
        state.emittedPhases.push(phase)
      }
    }),
    emitPlan: vi.fn(),
    emitMutant: vi.fn(),
    recordProgress: vi.fn(),
    emitTerminal: vi.fn(),
    resetStream: vi.fn((): void => {
      state.machineEnabled = false
      state.emittedPhases.length = 0
    }),
    __state: state,
  }
})

vi.mock('../../src/progress-stream.js', () => ({ ...streamMocks }))

// The logging providers are wiring, not behavior under test: this double
// keeps them transparent while recording the sink runMutationTest chose.
const loggingMocks = vi.hoisted(() => ({
  provideLogging: vi.fn((injector: unknown) => injector),
  provideLoggingBackend: vi.fn(
    async (injector: unknown, _sink: unknown, _showColors: unknown) => injector,
  ),
  provideLoggingClient: vi.fn(),
}))

vi.mock('../../src/logging/provide-logging.js', () => ({ ...loggingMocks }))

const machineResolved: ResolvedMode = { mode: 'machine', signal: 'tty', stdoutIsTTY: false }
const humanResolved: ResolvedMode = { mode: 'human', signal: 'env', stdoutIsTTY: false }

interface StubLogger {
  error(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  isTraceEnabled(): boolean
}

const stubLogger: StubLogger = {
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  isTraceEnabled: () => false,
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

function createFakeInjector(executorFns: ExecutorFns): Injector<{}> {
  const fake = createInjector()
    .provideValue(commonTokens.getLogger, (): StubLogger => stubLogger)
    .provideValue(commonTokens.options, { cleanTempDir: 'always' })
  vi.spyOn(fake, 'injectClass').mockImplementation((cls: unknown): unknown => {
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
  vi.spyOn(fake, 'provideValue').mockImplementation(() => fake)
  return fake
}

const stdoutIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const restoredSpies: Array<{ mockRestore(): void }> = []

let fakeInjector: Injector<{}>
let executorFns: ExecutorFns

function runInMode(mode: 'human' | 'machine') {
  vi.stubEnv('STRYKER_MODE', mode === 'human' ? 'human' : '')
  return new Stryker({}, () => fakeInjector).runMutationTest()
}

beforeEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
  vi.stubEnv('STRYKER_MODE', '')
  vi.stubEnv('AGENT', '')
  vi.stubEnv('CLAUDECODE', '')
  vi.stubEnv('CODEX_SANDBOX', '')
  streamMocks.resetStream()
  loggingMocks.provideLogging.mockClear()
  loggingMocks.provideLoggingBackend.mockClear()
  executorFns = createExecutorFns()
  fakeInjector = createFakeInjector(executorFns)
  executorFns.prepare.mockResolvedValue(fakeInjector)
  executorFns.instrument.mockResolvedValue(fakeInjector)
  executorFns.dryRun.mockResolvedValue(fakeInjector)
  executorFns.mutationTest.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const spy of restoredSpies) {
    spy.mockRestore()
  }
  restoredSpies.length = 0
  if (stdoutIsTTYDescriptor) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutIsTTYDescriptor)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

describe('the log sink (U13, KTD13)', () => {
  it('points the logging backend at stderr in machine mode', async () => {
    await runInMode('machine')

    expect(loggingMocks.provideLoggingBackend).toHaveBeenCalledTimes(1)
    expect(loggingMocks.provideLoggingBackend.mock.calls[0][1]).toBe(process.stderr)
  })

  it('points the logging backend at stdout in human mode', async () => {
    await runInMode('human')

    expect(loggingMocks.provideLoggingBackend.mock.calls[0][1]).toBe(process.stdout)
  })

  it('passes the sink and the colour gate — no level rides the call', async () => {
    await runInMode('machine')

    expect(loggingMocks.provideLoggingBackend.mock.calls[0]).toHaveLength(3)
    expect(loggingMocks.provideLoggingBackend.mock.calls[0][1]).toBe(process.stderr)
    expect(new LoggingBackend(process.stderr, false).activeStdoutLevel).toBe(LogLevel.Information)
  })

  it('turns colour off in machine mode so a 2>&1 merge carries no escape sequences (R8)', async () => {
    await runInMode('machine')

    expect(loggingMocks.provideLoggingBackend.mock.calls[0][2]).toBe(false)
  })

  it('writes an info-level log to stderr in machine mode and never to stdout', async () => {
    await runInMode('machine')
    expect(loggingMocks.provideLoggingBackend.mock.calls[0][1]).toBe(process.stderr)

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    restoredSpies.push(stderrWrite, stdoutWrite)

    const backend = new LoggingBackend(process.stderr, false)
    backend.log(LoggingEvent.create('Stryker', LogLevel.Information, ['machine-mode diagnostic']))

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('machine-mode diagnostic'))
    expect(stdoutWrite).not.toHaveBeenCalled()
  })

  it('keeps the Information level flowing to the human sink', async () => {
    await runInMode('human')
    expect(loggingMocks.provideLoggingBackend.mock.calls[0][1]).toBe(process.stdout)

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    restoredSpies.push(stderrWrite, stdoutWrite)

    const backend = new LoggingBackend(process.stdout, false)
    backend.log(LoggingEvent.create('Stryker', LogLevel.Information, ['human-mode diagnostic']))

    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('human-mode diagnostic'))
    expect(stderrWrite).not.toHaveBeenCalled()
  })
})

describe('the phase events (U13, R18, KTD14)', () => {
  it('emits all four phases in chain order, each before its stage runs', async () => {
    streamMocks.configureStream(machineResolved, 'fake-run-id')
    await runInMode('machine')

    expect(streamMocks.__state.emittedPhases).toEqual([
      'prepare',
      'instrument',
      'dry-run',
      'mutation-test',
    ])
    const phaseOrders = streamMocks.emitPhase.mock.invocationCallOrder
    expect(phaseOrders[0]).toBeLessThan(executorFns.prepare.mock.invocationCallOrder[0])
    expect(phaseOrders[1]).toBeLessThan(executorFns.instrument.mock.invocationCallOrder[0])
    expect(phaseOrders[2]).toBeLessThan(executorFns.dryRun.mock.invocationCallOrder[0])
    expect(phaseOrders[3]).toBeLessThan(executorFns.mutationTest.mock.invocationCallOrder[0])
  })

  it('emits the prepare phase before every other phase', async () => {
    streamMocks.configureStream(machineResolved, 'fake-run-id')
    await runInMode('machine')

    expect(streamMocks.__state.emittedPhases[0]).toBe('prepare')
    expect(streamMocks.emitPhase.mock.invocationCallOrder[0]).toBeLessThan(
      executorFns.prepare.mock.invocationCallOrder[0],
    )
  })

  it('has still emitted the prepare phase when PrepareExecutor throws', async () => {
    streamMocks.configureStream(machineResolved, 'fake-run-id')
    executorFns.prepare.mockRejectedValueOnce(new Error('prepare exploded'))

    await expect(runInMode('machine')).rejects.toThrow('prepare exploded')

    expect(streamMocks.__state.emittedPhases).toEqual(['prepare'])
  })
})
