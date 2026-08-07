import { PlanKind, schema } from '@stryker-mutator/api/core'
import type { MutantResult } from '@stryker-mutator/api/core'
import type { MutationTestingPlanReadyEvent } from '@stryker-mutator/api/report'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedMode } from '../../src/output-mode.js'
import {
  configureStream,
  emitMutant,
  emitPhase,
  emitPlan,
  emitTerminal,
  isStreamEnabled,
  recordProgress,
  resetStream,
  STREAM_SCHEMA_VERSION,
  streamRunId,
  TICK_INTERVAL_MS,
} from '../../src/progress-stream.js'
import type {
  StreamErrorLine,
  StreamHelpLine,
  StreamMutantLine,
  StreamTerminalLine,
} from '../../src/progress-stream.js'
import { ProgressStreamReporter } from '../../src/reporters/progress-stream-reporter.js'
import type { VerdictEnvelope } from '../../src/reporters/verdict-envelope.js'

// The stream module writes with `fs.writeSync` (a synchronous fd write, so
// `process.exit` cannot drop it — KTD11); the tests capture those writes
// through this mock.
const fsMocks = vi.hoisted(() => ({
  writeSync: vi.fn<(fd: number, text: string) => number>(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: fsMocks.writeSync }
})

const location: schema.Location = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 4 },
}

const machineMode: ResolvedMode = { mode: 'machine', signal: 'tty', stdoutIsTTY: false }
const humanMode: ResolvedMode = { mode: 'human', signal: 'tty', stdoutIsTTY: true }

const baseMutant: Omit<StreamMutantLine, 'kind'> = {
  id: '1',
  status: 'Survived',
  file: 'src/foo.ts',
  location,
  mutator: 'StringLiteral',
  replacement: '"x"',
  completed: 1,
  total: 1,
}

const verdictEnvelope = (): VerdictEnvelope => ({
  schemaVersion: '1.0',
  runId: 'run-1',
  mode: 'machine',
  signal: 'tty',
  score: 42,
  thresholds: { high: 80, low: 60, break: null },
  counts: {
    killed: 1,
    timeout: 0,
    survived: 1,
    noCoverage: 0,
    runtimeErrors: 0,
    compileErrors: 0,
    ignored: 0,
    pending: 0,
  },
  testContribution: null,
  reportFile: 'reports/mutation/mutation.json',
  mutants: [],
})

const verdictLine = (): StreamTerminalLine => ({ kind: 'verdict', ...verdictEnvelope() })

const errorLine = (): StreamErrorLine => ({
  kind: 'error',
  schemaVersion: STREAM_SCHEMA_VERSION,
  code: 2,
  error: 'ConfigError',
  remediation: 'Fix the config and rerun',
})

const mutantResult = (overrides: Partial<MutantResult> = {}): MutantResult => ({
  id: '1',
  fileName: 'src/foo.ts',
  location,
  mutatorName: 'StringLiteral',
  replacement: '"x"',
  status: 'Killed',
  ...overrides,
})

const planEvent = (count: number): MutationTestingPlanReadyEvent => ({
  mutantPlans: Array.from({ length: count }, (_, index) => ({
    plan: PlanKind.EarlyResult,
    mutant: {
      id: String(index),
      fileName: 'src/foo.ts',
      location,
      mutatorName: 'StringLiteral',
      replacement: '"x"',
      status: 'NoCoverage',
    },
  })),
})

const writtenLines = (): string[] =>
  fsMocks.writeSync.mock.calls
    .filter((call) => call[0] === 1)
    .map((call) => String(call[1]))

beforeEach(() => {
  resetStream()
  fsMocks.writeSync.mockClear()
})

afterEach(() => {
  resetStream()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('progress stream', () => {
  it('writes the stream header first, carrying the schema version and the run id', () => {
    configureStream(machineMode, 'run-abc')

    const lines = writtenLines().map((line) => JSON.parse(line))
    expect(lines[0]).toEqual({
      kind: 'stream',
      schemaVersion: STREAM_SCHEMA_VERSION,
      runId: 'run-abc',
      mode: 'machine',
      signal: 'tty',
    })
    expect(streamRunId()).toBe('run-abc')
    expect(fsMocks.writeSync.mock.calls.every((call) => call[0] === 1)).toBe(true)
  })

  it('streams one self-contained NDJSON line per event, plan before mutants', () => {
    configureStream(machineMode, 'run-1')
    emitPlan(2)
    emitMutant({ ...baseMutant, id: '1', status: 'Survived', completed: 1, total: 2 })
    emitMutant({ ...baseMutant, id: '2', status: 'Timeout', completed: 2, total: 2 })

    const lines = writtenLines()
    // Each raw line parses as its own JSON document — a line-by-line
    // consumer never has to buffer the stream.
    const parsed = lines.map((line) => JSON.parse(line))
    expect(parsed.map((line) => line.kind)).toEqual(['stream', 'plan', 'mutant', 'mutant'])
    expect(parsed[1]).toEqual({ kind: 'plan', total: 2 })
    expect(parsed[2]).toEqual({
      kind: 'mutant',
      id: '1',
      status: 'Survived',
      file: 'src/foo.ts',
      location,
      mutator: 'StringLiteral',
      replacement: '"x"',
      completed: 1,
      total: 2,
    })
    expect(parsed[3]).toEqual({
      kind: 'mutant',
      id: '2',
      status: 'Timeout',
      file: 'src/foo.ts',
      location,
      mutator: 'StringLiteral',
      replacement: '"x"',
      completed: 2,
      total: 2,
    })
  })

  it.each(['Survived', 'NoCoverage', 'Timeout', 'RuntimeError'] as const)(
    'emits a mutant line for the actionable status %s',
    (status) => {
      configureStream(machineMode, 'run-1')
      fsMocks.writeSync.mockClear()

      emitMutant({ ...baseMutant, status })

      const parsed = writtenLines().map((line) => JSON.parse(line))
      expect(parsed).toEqual([{ kind: 'mutant', ...baseMutant, status }])
    },
  )

  it.each(['Killed', 'Ignored', 'CompileError'] as const)(
    'emits no mutant line for the non-actionable status %s',
    (status) => {
      configureStream(machineMode, 'run-1')
      fsMocks.writeSync.mockClear()

      emitMutant({ ...baseMutant, status })

      expect(fsMocks.writeSync).not.toHaveBeenCalled()
    },
  )

  it('emits phase lines with elapsed time measured from stream configuration', () => {
    vi.useFakeTimers()
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()

    emitPhase('prepare')
    vi.advanceTimersByTime(5_000)
    emitPhase('dry-run')

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toEqual([
      { kind: 'phase', phase: 'prepare', elapsedMs: 0 },
      { kind: 'phase', phase: 'dry-run', elapsedMs: 5_000 },
    ])
  })

  it('emits ticks on the interval, carrying non-decreasing elapsed time and the recorded counts', () => {
    vi.useFakeTimers()
    configureStream(machineMode, 'run-1')
    recordProgress(3, 5)
    fsMocks.writeSync.mockClear()

    vi.advanceTimersByTime(TICK_INTERVAL_MS)
    vi.advanceTimersByTime(TICK_INTERVAL_MS)

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toEqual([
      { kind: 'tick', elapsedMs: TICK_INTERVAL_MS, completed: 3, total: 5 },
      { kind: 'tick', elapsedMs: TICK_INTERVAL_MS * 2, completed: 3, total: 5 },
    ])
  })

  it('unrefs the heartbeat so a configured stream never holds the process open', () => {
    const realSetInterval = globalThis.setInterval
    let capturedHandle: NodeJS.Timeout | null = null
    vi.spyOn(globalThis, 'setInterval').mockImplementation(
      (callback: (_: void) => void, delay?: number): NodeJS.Timeout => {
        const handle = realSetInterval(callback, delay)
        capturedHandle = handle
        return handle
      },
    )

    configureStream(machineMode, 'run-1')

    expect(capturedHandle).not.toBeNull()
    expect(capturedHandle?.hasRef()).toBe(false)
  })

  it('writes no tick after the terminal line, and no other line either', () => {
    vi.useFakeTimers()
    configureStream(machineMode, 'run-1')
    recordProgress(1, 2)
    fsMocks.writeSync.mockClear()

    emitTerminal(errorLine())
    vi.advanceTimersByTime(TICK_INTERVAL_MS * 3)
    emitPhase('mutation-test')
    emitPlan(2)
    emitMutant({ ...baseMutant, status: 'Survived' })

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toEqual([errorLine()])
  })

  it('writes exactly one terminal line: a second emitTerminal is dropped', () => {
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()

    emitTerminal(verdictLine())
    emitTerminal(verdictLine())
    emitTerminal(errorLine())

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ kind: 'verdict', runId: 'run-1' })
    expect(isStreamEnabled()).toBe(false)
  })

  it('is idempotent: a second configureStream writes no second header and starts no second heartbeat', () => {
    vi.useFakeTimers()
    configureStream(machineMode, 'run-1')
    configureStream(machineMode, 'run-2')
    fsMocks.writeSync.mockClear()

    vi.advanceTimersByTime(TICK_INTERVAL_MS)

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ kind: 'tick' })
    expect(streamRunId()).toBe('run-1')
  })

  it('keeps an earlier streamRunId read and the header id identical when configureStream gets an explicit id', () => {
    const readBeforeConfiguring = streamRunId()

    configureStream(machineMode, 'explicit-id')

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed[0]).toMatchObject({ kind: 'stream', runId: readBeforeConfiguring })
    expect(streamRunId()).toBe(readBeforeConfiguring)
  })

  it('writes nothing from any entry point before configureStream', () => {
    emitPhase('prepare')
    emitPlan(2)
    emitMutant({ ...baseMutant, status: 'Survived' })
    recordProgress(1, 2)
    emitTerminal(errorLine())

    expect(fsMocks.writeSync).not.toHaveBeenCalled()
    expect(isStreamEnabled()).toBe(false)
    const mintedWithoutConfiguring = streamRunId()
    expect(mintedWithoutConfiguring).toHaveLength(26)
    expect(streamRunId()).toBe(mintedWithoutConfiguring)
  })

  it('writes nothing from any entry point in human mode', () => {
    configureStream(humanMode, 'run-1')
    emitPhase('prepare')
    emitPlan(2)
    emitMutant({ ...baseMutant, status: 'Survived' })
    recordProgress(1, 2)
    emitTerminal(verdictLine())

    expect(fsMocks.writeSync).not.toHaveBeenCalled()
    expect(isStreamEnabled()).toBe(false)
    expect(streamRunId()).toBe('run-1')
  })

  it('resetStream clears the state so a fresh run can configure again', () => {
    configureStream(machineMode, 'run-1')
    emitTerminal(verdictLine())
    resetStream()
    fsMocks.writeSync.mockClear()

    configureStream(machineMode, 'run-2')

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toEqual([
      {
        kind: 'stream',
        schemaVersion: STREAM_SCHEMA_VERSION,
        runId: 'run-2',
        mode: 'machine',
        signal: 'tty',
      },
    ])
  })

  it('does not propagate an EPIPE from a phase write, and attempts no further write', () => {
    vi.useFakeTimers()
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()
    fsMocks.writeSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    })

    expect(() => emitPhase('prepare')).not.toThrow()

    fsMocks.writeSync.mockClear()
    vi.advanceTimersByTime(TICK_INTERVAL_MS * 3)
    emitPlan(2)
    emitMutant({ ...baseMutant, status: 'Survived' })
    emitTerminal(verdictLine())

    expect(fsMocks.writeSync).not.toHaveBeenCalled()
    expect(isStreamEnabled()).toBe(false)
  })

  it('does not propagate an EPIPE from a heartbeat tick, and clears the heartbeat', () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()
    fsMocks.writeSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    })

    expect(() => vi.advanceTimersByTime(TICK_INTERVAL_MS)).not.toThrow()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does not propagate an EPIPE from the terminal write', () => {
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()
    fsMocks.writeSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    })

    expect(() => emitTerminal(verdictLine())).not.toThrow()
    expect(fsMocks.writeSync).toHaveBeenCalledTimes(1)
    expect(isStreamEnabled()).toBe(false)
  })

  it('starts no heartbeat when the header write fails with EPIPE', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    fsMocks.writeSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    })

    expect(() => configureStream(machineMode, 'run-1')).not.toThrow()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('accepts a help line as the terminal event and still refuses a second terminal', () => {
    configureStream(machineMode, 'run-1')
    fsMocks.writeSync.mockClear()

    const helpLine: StreamHelpLine = {
      kind: 'help',
      schemaVersion: STREAM_SCHEMA_VERSION,
      code: 0,
      help: 'usage text',
    }
    emitTerminal(helpLine)
    emitTerminal(verdictLine())

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed).toEqual([helpLine])
    expect(isStreamEnabled()).toBe(false)
  })
})

describe('ProgressStreamReporter', () => {
  it('feeds the plan and the tested mutants into the stream, applying the R20 filter', () => {
    configureStream(machineMode, 'run-1')
    const reporter = new ProgressStreamReporter()

    reporter.onMutationTestingPlanReady(planEvent(3))
    reporter.onMutantTested(mutantResult({ id: '1', status: 'Killed' }))
    reporter.onMutantTested(mutantResult({ id: '2', status: 'Survived' }))
    reporter.onMutantTested(mutantResult({ id: '3', status: 'Timeout', replacement: undefined }))

    const parsed = writtenLines().map((line) => JSON.parse(line))
    expect(parsed.map((line) => line.kind)).toEqual(['stream', 'plan', 'mutant', 'mutant'])
    expect(parsed[1]).toEqual({ kind: 'plan', total: 3 })
    expect(parsed[2]).toEqual({
      kind: 'mutant',
      id: '2',
      status: 'Survived',
      file: 'src/foo.ts',
      location,
      mutator: 'StringLiteral',
      replacement: '"x"',
      completed: 2,
      total: 3,
    })
    // The killed mutant emits nothing; the replacement-less mutant reports null.
    expect(parsed[3]).toEqual({
      kind: 'mutant',
      id: '3',
      status: 'Timeout',
      file: 'src/foo.ts',
      location,
      mutator: 'StringLiteral',
      replacement: null,
      completed: 3,
      total: 3,
    })
  })

  it('writes nothing in human mode', () => {
    configureStream(humanMode, 'run-1')
    const reporter = new ProgressStreamReporter()

    reporter.onMutationTestingPlanReady(planEvent(2))
    reporter.onMutantTested(mutantResult({ id: '1', status: 'Survived' }))

    expect(fsMocks.writeSync).not.toHaveBeenCalled()
  })
})
