import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { commonTokens, PluginKind } from '@stryker-mutator/api/plugin'
import { noopLogger } from '@stryker-mutator/util'
import { Effect, Exit } from 'effect'
import { createInjector } from 'typed-inject'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { ConfigReader } from '../../src/config/config-reader.js'
import { forkCoreSchema } from '../../src/config/fork-schema.js'
import { createDefaultOptions, OptionsValidator } from '../../src/config/options-validator.js'
import { REMOVED_OPTIONS } from '../../src/config/removed-surface.js'
import { PluginCreator } from '../../src/di/plugin-creator.js'
import { ConfigError } from '../../src/errors.js'
import { resolveCliExitCode, runStrykerCli, strykerCliEffect } from '../../src/stryker-cli.js'
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

const validator = (): OptionsValidator => new OptionsValidator(forkCoreSchema, noopLogger)

function parseArgs(args: string[]): Promise<number> {
  const runMutationTest: StrykerRun = async () => {}
  const exit = Effect.exit(
    strykerCliEffect(['node', 'stryker', ...args], runMutationTest),
  )
  return Effect.runPromise(exit).then((exitResult: Exit.Exit<unknown, unknown>) => resolveCliExitCode(exitResult))
}

// The removed flags U2 dropped in the commander→@effect/cli port (R2, R8,
// R13). Each must land in the framework's usage-error path.
const REMOVED_FLAGS = [
  '--files',
  '--allowConsoleColors',
  '--dashboard.project',
  '--dashboard.version',
  '--dashboard.module',
  '--dashboard.baseUrl',
] as const

// The top-level config keys U9 orphaned. The upstream schema still declares
// them, so without the denylist scan they pass AJV and are silently ignored.
const entriesFor = (...names: string[]) => names.map((name) => ({ name, remediation: REMOVED_OPTIONS[name] as string }))

const REMOVED_KEYS = entriesFor('dashboard', 'eventReporter')

// The reporter names U9 pruned from the registry. They pass the schema as
// plain string items, so the scan must check the `reporters` array values.
const REMOVED_REPORTERS = entriesFor('dots', 'event-recorder', 'progress-append-only', 'dashboard')

describe('removed surface on the command line', () => {
  it.each(REMOVED_FLAGS)('rejects the removed flag %s with exit 2', async (flag) => {
    expect(await parseArgs(['run', flag])).toBe(2)
  })
})

describe('removed surface in a config file', () => {
  it.each(REMOVED_KEYS)(
    'rejects the removed config key "%s" with a ConfigError naming the key',
    ({ name, remediation }) => {
      const attempt = (): void => {
        const v: OptionsValidator = validator()
        v.validate({ [name]: {} })
      }
      expect(attempt).toThrow(ConfigError)
      expect(attempt).toThrow(`"${name}"`)
      expect(attempt).toThrow(remediation)
    },
  )

  it.each(REMOVED_REPORTERS)(
    'rejects the removed reporter name "%s" inside `reporters` with a ConfigError naming it',
    ({ name, remediation }) => {
      const attempt = (): void => {
        const v: OptionsValidator = validator()
        v.validate({ reporters: [name] })
      }
      expect(attempt).toThrow(ConfigError)
      expect(attempt).toThrow(`"${name}"`)
      expect(attempt).toThrow(remediation)
    },
  )

  it('fires with warnings.unknownOptions disabled — it does not ride the warning path', () => {
    // This is the test that catches the wrong placement: had the scan lived
    // inside schemaValidate (or relied on markExcessOptions), a removed key
    // with the unknownOptions warning disabled would pass silently.
    const attempt = (): void => {
      const v: OptionsValidator = validator()
      v.validate({
        dashboard: {},
        warnings: { unknownOptions: false },
      })
    }
    expect(attempt).toThrow(ConfigError)
    expect(attempt).toThrow('"dashboard"')
  })

  it('does not hard-fail an unknown-but-not-removed config key', () => {
    const v: OptionsValidator = validator()
    const options: Record<string, unknown> = { someFutureOption: 42 }
    v.validate(options)
    expect(options['someFutureOption']).toBe(42)
  })

  it('leaves a deprecated-but-migrated key soft instead of denylisting it', () => {
    // `files` was never removed — removeDeprecatedOptions rewrites it into
    // ignorePatterns and the scan must not turn it into a hard error.
    const v: OptionsValidator = validator()
    const options: Record<string, unknown> = {
      files: ['src/**/*.js'],
      ignorePatterns: [],
    }
    v.validate(options)
    expect(options['files']).toBeUndefined()
    expect(options['ignorePatterns']).toEqual(['**', '!src/**/*.js'])
  })
})

describe('removed surface through the full CLI', () => {
  it('fails for the same removed name on the command line and in a config file', async () => {
    expect(await parseArgs(['run', '--dashboard.project'])).toBe(2)
    const attempt = (): void => {
      const v: OptionsValidator = validator()
      v.validate({ dashboard: { project: 'x' } })
    }
    expect(attempt).toThrow(ConfigError)
    expect(attempt).toThrow('"dashboard"')
  })

  it('classifies a missing plugin as a config error, not a plain Error', () => {
    const pluginCreator = new PluginCreator(
      new Map(),
      createInjector()
        .provideValue(commonTokens.options, createDefaultOptions())
        .provideValue(commonTokens.fileDescriptions, {})
        .provideValue(commonTokens.getLogger, () => noopLogger)
        .provideValue(commonTokens.logger, noopLogger),
    )
    expect(() => pluginCreator.create(PluginKind.Reporter, 'dots')).toThrow(ConfigError)
    expect(() => pluginCreator.create(PluginKind.Reporter, 'some-typo-reporter')).toThrow(ConfigError)
  })

  it('exports exactly the names U9 removed', () => {
    // Pins the content, so dropping an entry (or smuggling one in) goes red.
    expect(Object.keys(REMOVED_OPTIONS).sort()).toEqual([
      'dashboard',
      'dots',
      'event-recorder',
      'eventReporter',
      'progress-append-only',
    ])
  })

  it('enforces every name it exports as a config key, so U11 can trust the oracle', () => {
    for (const name of Object.keys(REMOVED_OPTIONS)) {
      expect(() => validator().validate({ [name]: {} })).toThrow(ConfigError)
    }
  })

  it('enforces every name it exports inside the reporters array', () => {
    for (const name of Object.keys(REMOVED_OPTIONS)) {
      expect(() => validator().validate({ reporters: [name] })).toThrow(ConfigError)
    }
  })

  it('keeps the removed options out of the schema so no default injects them', () => {
    // The regression that made every consumer fail: AJV injects a default for
    // each declared property, so a declared `dashboard` landed in the resolved
    // options of runs whose config never mentioned it.
    const properties = forkCoreSchema.properties
    if (typeof properties !== 'object' || properties === null) {
      throw new Error('the fork schema declares no properties object')
    }
    expect(Object.keys(properties).filter((name) => Object.hasOwn(REMOVED_OPTIONS, name))).toEqual([])
  })
})

describe('machine-mode envelope for a removed config key', () => {
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

  it('names the removed key and its remediation in the stdout error terminal event', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'stryker-removed-surface-'))
    const configFile = path.join(dir, 'stryker.config.json')
    writeFileSync(configFile, JSON.stringify({ dashboard: { project: 'x' } }))
    try {
      const runMutationTest: StrykerRun = async () => {
        const reader = new ConfigReader(
          noopLogger,
          new OptionsValidator(forkCoreSchema, noopLogger),
        )
        await reader.readConfig({ configFile })
      }
      runStrykerCli(['node', 'stryker', 'run', configFile], runMutationTest)
      const deadline = Date.now() + 2000
      while (exitMock.mock.calls.length === 0 && Date.now() < deadline) {
        const { promise, resolve } = Promise.withResolvers<void>()
        setTimeout(resolve, 5)
        await promise
      }

      expect(exitMock).toHaveBeenCalled()
      const exitCode = exitMock.mock.calls[0]?.[0]
      const stdoutLines = fsMocks.writeSync.mock.calls
        .filter((call) => call[0] === 1)
        .map((call) => String(call[1]))
      const [streamHeader = '', errorTerminal = ''] = stdoutLines
      expect(stdoutLines).toHaveLength(2)
      expect(JSON.parse(streamHeader)).toMatchObject({ kind: 'stream' })
      const envelope = JSON.parse(errorTerminal) as {
        kind: string
        code: number
        error: string
        remediation: string
      }
      expect(envelope.kind).toBe('error')
      expect(
        fsMocks.writeSync.mock.calls.filter((call) => call[0] === 2),
      ).toHaveLength(0)
      // Pin the value, not just envelope/exit agreement: both were 1 while
      // this only compared them to each other, so a config error was
      // indistinguishable from a failed verdict.
      expect(exitCode).toBe(ExitClass.ConfigError)
      expect(envelope.code).toBe(ExitClass.ConfigError)
      expect(envelope.error).toContain('"dashboard"')
      expect(envelope.error).toContain('the "dashboard" reporter')
      expect(envelope.remediation).toContain('"dashboard"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
