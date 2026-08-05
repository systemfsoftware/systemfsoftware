import * as HelpDoc from '@effect/cli/HelpDoc'
import * as ValidationError from '@effect/cli/ValidationError'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import * as FiberId from 'effect/FiberId'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { ConfigError } from '../../src/errors.js'
import { buildErrorEnvelope, describeFailure, remediationFor, runStrykerCli } from '../../src/stryker-cli.js'
import type { StrykerRun } from '../../src/stryker-cli.js'

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
      schemaVersion: '1.0',
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

describe('machine-mode error envelope', () => {
  let exitMock: MockInstance

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)
    process.env['STRYKER_MODE'] = 'machine'
    fsMocks.writeSync.mockClear()
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
    vi.restoreAllMocks()
  })

  it('writes exactly one parseable JSON object to stderr and nothing to stdout for a usage error', async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    expect(exitMock).toHaveBeenCalledWith(2)
    const stderrLines = writtenLines(2)
    expect(stderrLines).toHaveLength(1)
    const envelope = JSON.parse(stderrLines[0] as string) as Record<string, string>
    expect(envelope['schemaVersion']).toBe('1.0')
    expect(envelope['error']).toContain('unknown argument')
    expect(envelope['error'].length).toBeGreaterThan(0)
    expect(envelope['remediation'].length).toBeGreaterThan(0)
    expect(writtenLines(1)).toHaveLength(0)
  })

  it("matches the envelope's code to the process exit code", async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    const exitCode = exitMock.mock.calls[0]?.[0]
    const envelope = JSON.parse(writtenLines(2)[0] as string) as { code: number }
    expect(envelope.code).toBe(exitCode)
  })

  it('never puts a raw ANSI escape byte on stderr', async () => {
    runStrykerCli(['node', 'stryker', 'run', '--files'])
    await flush()

    expect(writtenLines(2)[0]).not.toContain('\u001b')
  })

  it('does not leak an ANSI help document for --help; emits a structured document on stdout', async () => {
    runStrykerCli(['node', 'stryker', '--help'])
    await flush()

    expect(exitMock).not.toHaveBeenCalled()
    expect(writtenLines(2)).toHaveLength(0)
    const stdoutLines = writtenLines(1)
    expect(stdoutLines).toHaveLength(1)
    const document = JSON.parse(stdoutLines[0] as string) as { schemaVersion: string; code: number; help: string }
    expect(document.schemaVersion).toBe('1.0')
    expect(document.code).toBe(0)
    expect(document.help).toContain('stryker')
    expect(stdoutLines[0]).not.toContain('\u001b')
  })

  it('names the offending config file in the remediation for a config failure', async () => {
    const runMutationTest: StrykerRun = async () => {
      throw new ConfigError('Invalid config file "stryker.config.json". Unknown option "foo"')
    }
    runStrykerCli(['node', 'stryker', 'run'], runMutationTest)
    await flush()

    expect(exitMock).toHaveBeenCalledWith(1)
    const stderrLines = writtenLines(2)
    expect(stderrLines).toHaveLength(1)
    const envelope = JSON.parse(stderrLines[0] as string) as { code: number; error: string; remediation: string }
    expect(envelope.code).toBe(1)
    expect(envelope.error).toContain('Invalid config file "stryker.config.json"')
    expect(envelope.remediation).toContain('stryker.config.json')
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
    fsMocks.writeSync.mockClear()
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
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
