import * as HelpDoc from '@effect/cli/HelpDoc'
import * as ValidationError from '@effect/cli/ValidationError'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import * as FiberId from 'effect/FiberId'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { ConfigError } from '../../src/errors.js'
import { emitTerminal, resetStream, STREAM_SCHEMA_VERSION } from '../../src/progress-stream.js'
import type { VerdictEnvelope } from '../../src/reporters/verdict-envelope.js'
import { buildErrorEnvelope, describeFailure, remediationFor, runStrykerCli } from '../../src/stryker-cli.js'
import type { StrykerRun } from '../../src/stryker-cli.js'
import { ExitClass } from '../../src/utils/object-utils.js'

// The terminating bootstrap writes the envelope with `fs.writeSync` (a
// synchronous fd write, so `process.exit` cannot drop it); the integration
// tests capture those writes through this mock.
const fsMocks = vi.hoisted(() => ({
  writeSync: vi.fn<(fd: number, text: string) => number>(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: fsMocks.writeSync }
})

const usageError = (): ValidationError.ValidationError =>
  ValidationError.invalidValue(HelpDoc.p("Received unknown argument: '--files'"))

// Builds exits with an `unknown` failure channel, matching what the runtime
// observes (`Exit.Exit<unknown, unknown>`) and keeping the global `Error`
// type out of the Effect failure channel.
const failureExit = (value: unknown): Exit.Exit<unknown, unknown> => Exit.fail(value)

const writtenLines = (fd: number): string[] =>
  fsMocks.writeSync.mock.calls.filter((call) => call[0] === fd).map((call) => String(call[1]))

const flush = async (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 10)
  await promise
}

// A minimal verdict document for the teardown-ordering test: the run emits
// this terminal `verdict` line first and then fails, and the stream module
// must keep it as the only terminal line (first write wins, KTD11).
const verdictFixture: VerdictEnvelope = {
  schemaVersion: '1.0',
  runId: 'verdict-then-failure',
  mode: 'machine',
  signal: 'env',
  score: null,
  thresholds: { high: 80, low: 60, break: 60 },
  counts: {
    killed: 0,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    runtimeErrors: 0,
    compileErrors: 0,
    ignored: 0,
    pending: 0,
  },
  testContribution: null,
  reportFile: null,
  mutants: [],
}

describe('remediationFor', () => {
  it('points usage errors at --help', () => {
    expect(remediationFor(failureExit(usageError()), 2)).toContain('--help')
  })

  it('names the offending config file for config errors', () => {
    const exit = failureExit(new ConfigError('Invalid config file "stryker.config.json". Unknown option "foo"'))
    expect(remediationFor(exit, 1)).toContain('stryker.config.json')
  })

  it('points runtime errors at the report file and the verdict envelope', () => {
    expect(remediationFor(failureExit(new Error('runner crashed')), 3)).toContain('--reportFile')
    expect(remediationFor(failureExit(new Error('runner crashed')), 1)).toContain('verdict envelope')
  })

  it('asks for a bug report for internal defects', () => {
    expect(remediationFor(failureExit(new Error('unexpected')), 4)).toContain(
      'github.com/systemfsoftware/systemfsoftware/issues',
    )
  })

  it('explains signal termination for POSIX 128 + n codes', () => {
    expect(remediationFor(failureExit(new Error('interrupted')), 130)).toContain('interrupted')
    expect(remediationFor(failureExit(new Error('interrupted')), 143)).toContain('interrupted')
  })
})

describe('buildErrorEnvelope', () => {
  it('carries the exit code, the captured text, and a non-empty remediation', () => {
    const envelope = buildErrorEnvelope(failureExit(usageError()), 2, 'captured framework doc')
    expect(envelope).toEqual({
      schemaVersion: STREAM_SCHEMA_VERSION,
      code: 2,
      error: 'captured framework doc',
      remediation: 're-run with --help to see the full usage',
    })
  })

  it('falls back to the failure message when nothing was captured', () => {
    const exit = failureExit(new ConfigError('Invalid config file "stryker.config.json". Bad key'))
    expect(buildErrorEnvelope(exit, 1, '').error).toBe(
      'Invalid config file "stryker.config.json". Bad key',
    )
  })
})

describe('describeFailure', () => {
  it('returns an Error message', () => {
    expect(describeFailure(failureExit(new Error('boom')))).toBe('boom')
  })

  it('stringifies a non-Error failure', () => {
    expect(describeFailure(failureExit('boom'))).toBe('boom')
  })

  it('renders an interrupt-only cause without throwing', () => {
    const rendered = describeFailure(failureExit(Cause.interrupt(FiberId.none)))
    expect(typeof rendered).toBe('string')
    expect(rendered.length).toBeGreaterThan(0)
  })
})

describe('machine-mode terminal events', () => {
  let exitMock: MockInstance

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)
    process.env['STRYKER_MODE'] = 'machine'
    // The stream module keeps terminal-emission state across runs; each test
    // starts fresh so a previous run's terminal line cannot suppress this one.
    resetStream()
    fsMocks.writeSync.mockClear()
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
    resetStream()
    vi.restoreAllMocks()
  })

  // The last `verdict` or `error` line the run wrote to `fd` — the stream
  // header and lifecycle lines are not terminal events and are skipped.
  const terminalLineOf = (fd: number): string => {
    const terminal = writtenLines(fd).reverse().find((line) => {
      const parsed = JSON.parse(line) as { kind?: string }
      return parsed.kind === 'verdict' || parsed.kind === 'error'
    })
    expect(terminal).toBeDefined()
    return terminal as string
  }

  it('opens the stream with a header and writes exactly one error terminal event as the last stdout line for a usage error', async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    expect(exitMock).toHaveBeenCalledWith(2)
    expect(writtenLines(2)).toHaveLength(0)
    const stdoutLines = writtenLines(1)
    expect(stdoutLines.length).toBeGreaterThanOrEqual(2)
    expect(JSON.parse(stdoutLines[0] as string) as { kind?: string }).toMatchObject({ kind: 'stream' })
    const envelope = JSON.parse(stdoutLines[stdoutLines.length - 1] as string) as {
      kind: string
      schemaVersion: string
      error: string
      remediation: string
    }
    expect(envelope.kind).toBe('error')
    expect(envelope.schemaVersion).toBe(STREAM_SCHEMA_VERSION)
    expect(envelope.error).toContain('unknown argument')
    expect(envelope.remediation).toContain('--help')
  })

  it("matches the error terminal event's code to the process exit code", async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    const envelope = JSON.parse(terminalLineOf(1)) as { code: number }
    expect(exitMock.mock.calls[0]?.[0]).toBe(2)
    expect(envelope.code).toBe(2)
  })

  it('never puts a raw ANSI escape byte on any descriptor', async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    const allLines = [...writtenLines(1), ...writtenLines(2)]
    expect(allLines.length).toBeGreaterThan(0)
    for (const line of allLines) {
      expect(line).not.toContain('\u001b')
    }
  })

  it('does not leak an ANSI help document for --help; emits the header and one structured document on stdout', async () => {
    runStrykerCli(['node', 'stryker', '--help'])
    await flush()

    expect(exitMock).not.toHaveBeenCalled()
    expect(writtenLines(2)).toHaveLength(0)
    const stdoutLines = writtenLines(1)
    expect(JSON.parse(stdoutLines[0] as string) as { kind?: string }).toMatchObject({ kind: 'stream' })
    const documentLines = stdoutLines.slice(1)
    expect(documentLines).toHaveLength(1)
    const document = JSON.parse(documentLines[0] as string) as {
      kind: string
      schemaVersion: string
      code: number
      help: string
    }
    expect(document.kind).toBe('help')
    expect(document.schemaVersion).toBe(STREAM_SCHEMA_VERSION)
    expect(document.code).toBe(0)
    expect(document.help).toContain('stryker')
    for (const line of stdoutLines) {
      expect(line).not.toContain('\u001b')
    }
  })

  it('tags the --llms manifest as the single terminal event, every line JSON, in machine mode', async () => {
    runStrykerCli(['node', 'stryker', '--llms'])
    await flush()

    expect(exitMock).not.toHaveBeenCalled()
    expect(writtenLines(2)).toHaveLength(0)
    const stdoutLines = writtenLines(1)
    expect(stdoutLines.length).toBeGreaterThanOrEqual(2)
    expect(JSON.parse(stdoutLines[0] as string) as { kind?: string }).toMatchObject({ kind: 'stream' })
    for (const line of stdoutLines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    const terminal = JSON.parse(stdoutLines[stdoutLines.length - 1] as string) as {
      kind: string
      schemaVersion: string
      code: number
      manifest: string
    }
    expect(terminal.kind).toBe('manifest')
    expect(terminal.schemaVersion).toBe(STREAM_SCHEMA_VERSION)
    expect(terminal.code).toBe(0)
    expect(JSON.parse(terminal.manifest) as { tool?: string }).toMatchObject({ tool: 'stryker' })
  })

  it('closes a successful no-score run with a null-score verdict terminal line', async () => {
    // The `--dryRunOnly` executor early-returns before `reportAll`, so no
    // verdict is emitted during the run; the teardown must close the stream.
    const runMutationTest: StrykerRun = async () => undefined
    runStrykerCli(['node', 'stryker', 'run', '--dryRunOnly'], runMutationTest)
    await flush()

    expect(exitMock).not.toHaveBeenCalled()
    const stdoutLines = writtenLines(1)
    expect(JSON.parse(stdoutLines[0] as string) as { kind?: string }).toMatchObject({ kind: 'stream' })
    expect(stdoutLines).toHaveLength(2)
    const verdict = JSON.parse(stdoutLines[stdoutLines.length - 1] as string) as {
      kind: string
      score: number | null
      counts: { survived: number }
      mutants: unknown[]
    }
    expect(verdict.kind).toBe('verdict')
    expect(verdict.score).toBeNull()
    expect(verdict.counts.survived).toBe(0)
    expect(verdict.mutants).toEqual([])
  })

  it('names the offending config file in the remediation for a config failure', async () => {
    const runMutationTest: StrykerRun = async () => {
      throw new ConfigError('Invalid config file "stryker.config.json". Unknown option "foo"')
    }
    runStrykerCli(['node', 'stryker', 'run'], runMutationTest)
    await flush()

    expect(exitMock).toHaveBeenCalledWith(ExitClass.ConfigError)
    expect(writtenLines(2)).toHaveLength(0)
    const envelope = JSON.parse(terminalLineOf(1)) as {
      kind: string
      code: number
      error: string
      remediation: string
    }
    expect(envelope.kind).toBe('error')
    expect(envelope.code).toBe(ExitClass.ConfigError)
    expect(envelope.error).toContain('Invalid config file "stryker.config.json"')
    expect(envelope.remediation).toContain('stryker.config.json')
  })

  it('yields exactly one terminal line when a run emits a verdict and then fails teardown', async () => {
    const runMutationTest: StrykerRun = async () => {
      emitTerminal({ kind: 'verdict', ...verdictFixture })
      throw new Error('teardown exploded after the verdict')
    }
    runStrykerCli(['node', 'stryker', 'run'], runMutationTest)
    await flush()

    expect(exitMock).toHaveBeenCalledWith(1)
    const terminalLines = writtenLines(1).filter((line) => {
      const parsed = JSON.parse(line) as { kind?: string }
      return parsed.kind === 'verdict' || parsed.kind === 'error'
    })
    expect(terminalLines).toHaveLength(1)
    expect(JSON.parse(terminalLines[0] as string) as { kind?: string }).toMatchObject({ kind: 'verdict' })
  })
})

describe('human mode', () => {
  let exitMock: MockInstance
  let consoleErrorMock: MockInstance

  beforeEach(() => {
    consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)
    process.env['STRYKER_MODE'] = 'human'
    resetStream()
    fsMocks.writeSync.mockClear()
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
    resetStream()
    vi.restoreAllMocks()
  })

  it('writes the framework prose through the console and no JSON envelope', async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    expect(exitMock).toHaveBeenCalledWith(2)
    expect(writtenLines(1)).toHaveLength(0)
    expect(writtenLines(2)).toHaveLength(0)
    expect(consoleErrorMock).toHaveBeenCalled()
    const prose = consoleErrorMock.mock.calls.map((call) => String(call[0])).join('\n')
    expect(prose).toContain('unknown argument')
    expect(() => JSON.parse(prose)).toThrow()
  })
})
