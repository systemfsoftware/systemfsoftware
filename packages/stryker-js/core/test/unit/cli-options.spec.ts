import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PartialStrykerOptions } from '@stryker-mutator/api/core'
import { noopLogger } from '@stryker-mutator/util'
import { Effect, Exit } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigReader } from '../../src/config/config-reader.js'
import { forkCoreSchema } from '../../src/config/fork-schema.js'
import { OptionsValidator } from '../../src/config/options-validator.js'
import { resolveCliExitCode, strykerCliEffect } from '../../src/stryker-cli.js'
import type { StrykerRun } from '../../src/stryker-cli.js'
import { strykerVersion } from '../../src/stryker-package.js'

function parseArgs(args: string[]): Promise<{
  code: number
  options: PartialStrykerOptions | undefined
}> {
  let options: PartialStrykerOptions | undefined
  const runMutationTest: StrykerRun = async (parsed) => {
    options = parsed
  }
  const exit = Effect.exit(
    strykerCliEffect(['node', 'stryker', ...args], runMutationTest),
  )
  return Effect.runPromise(exit).then((exitResult: Exit.Exit<unknown, unknown>) => ({
    code: resolveCliExitCode(exitResult),
    options,
  }))
}

async function parseSuccess(args: string[]): Promise<PartialStrykerOptions> {
  const { code, options } = await parseArgs(args)
  expect(code).toBe(0)
  return options ?? {}
}

describe('stryker cli option parsing', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses a comma separated list option', async () => {
    const options = await parseSuccess(['run', '--mutate', 'src/**/*.js,src/**/*.ts'])
    expect(options.mutate).toEqual(['src/**/*.js', 'src/**/*.ts'])
  })

  it('parses a comma separated list option with a single value', async () => {
    const options = await parseSuccess(['run', '--reporters', 'html'])
    expect(options.reporters).toEqual(['html'])
  })

  it('parses the short alias of an option', async () => {
    const options = await parseSuccess(['run', '-m', 'src/**/*.js'])
    expect(options.mutate).toEqual(['src/**/*.js'])
  })

  it('splits node args on spaces', async () => {
    const options = await parseSuccess([
      'run',
      '--checkerNodeArgs',
      '--inspect-brk --trace-warnings',
    ])
    expect(options.checkerNodeArgs).toEqual(['--inspect-brk', '--trace-warnings'])
  })

  it('splits test runner node args on spaces', async () => {
    const options = await parseSuccess([
      'run',
      '--testRunnerNodeArgs',
      '--inspect',
    ])
    expect(options.testRunnerNodeArgs).toEqual(['--inspect'])
  })

  it('parses concurrency as an integer when it is a plain number', async () => {
    const options = await parseSuccess(['run', '--concurrency', '4'])
    expect(options.concurrency).toBe(4)
  })

  it('keeps concurrency as a string when it is not a plain number', async () => {
    const options = await parseSuccess(['run', '--concurrency', '50%'])
    expect(options.concurrency).toBe('50%')
  })

  it.each([
    ['always', 'always'],
    ['false', false],
    ['0', false],
    ['TRUE', true],
  ])('parses --cleanTempDir %s', async (value, expected) => {
    const options = await parseSuccess(['run', '--cleanTempDir', value])
    expect(options.cleanTempDir).toBe(expected)
  })

  it('parses numeric options', async () => {
    const options = await parseSuccess([
      'run',
      '--timeoutMS',
      '3000',
      '--timeoutFactor',
      '1.5',
      '--dryRunTimeoutMinutes',
      '5',
      '--maxConcurrentTestRunners',
      '2',
      '--maxTestRunnerReuse',
      '0',
    ])
    expect(options.timeoutMS).toBe(3000)
    expect(options.timeoutFactor).toBe(1.5)
    expect(options.dryRunTimeoutMinutes).toBe(5)
    expect(options.maxConcurrentTestRunners).toBe(2)
    expect(options.maxTestRunnerReuse).toBe(0)
  })

  it('parses choice options', async () => {
    const options = await parseSuccess([
      'run',
      '--coverageAnalysis',
      'perTest',
      '--logLevel',
      'debug',
      '--fileLogLevel',
      'off',
    ])
    expect(options.coverageAnalysis).toBe('perTest')
    expect(options.logLevel).toBe('debug')
    expect(options.fileLogLevel).toBe('off')
  })

  it('parses string options', async () => {
    const options = await parseSuccess([
      'run',
      '--testRunner',
      'vitest',
      '--buildCommand',
      'npm run build',
      '--tempDirName',
      '.stryker-tmp',
      '--incrementalFile',
      'stryker-incremental.json',
    ])
    expect(options.testRunner).toBe('vitest')
    expect(options.buildCommand).toBe('npm run build')
    expect(options.tempDirName).toBe('.stryker-tmp')
    expect(options.incrementalFile).toBe('stryker-incremental.json')
  })

  it('parses list options', async () => {
    const options = await parseSuccess([
      'run',
      '--ignorePatterns',
      'dist,reports',
      '--checkers',
      'typescript',
      '--plugins',
      'a,b',
      '--appendPlugins',
      'c',
      '--testFiles',
      'a.spec.ts,b.spec.ts',
    ])
    expect(options.ignorePatterns).toEqual(['dist', 'reports'])
    expect(options.checkers).toEqual(['typescript'])
    expect(options.plugins).toEqual(['a', 'b'])
    expect(options.appendPlugins).toEqual(['c'])
    expect(options.testFiles).toEqual(['a.spec.ts', 'b.spec.ts'])
  })

  it.each([
    ['ignoreStatic'],
    ['incremental'],
    ['force'],
    ['dryRunOnly'],
    ['disableBail'],
    ['allowEmpty'],
    ['inPlace'],
  ])('parses boolean flag --%s as true', async (flag) => {
    const options = await parseSuccess(['run', `--${flag}`])
    expect(options[flag as keyof PartialStrykerOptions]).toBe(true)
  })

  it('leaves an omitted boolean flag absent from the options', async () => {
    const options = await parseSuccess(['run'])
    expect(options.force).toBeUndefined()
    expect(options.inPlace).toBeUndefined()
  })

  it('accepts the --survivors flag for the survivor re-run', async () => {
    // U8 wired the flag: it now admits against the prior report of the
    // fixture project and re-tests exactly the survivor set.
    const fixtureDir = fileURLToPath(new URL('./fixtures/survivors/project', import.meta.url))
    const originalCwd = process.cwd()
    process.chdir(fixtureDir)
    try {
      const { code, options } = await parseArgs(['run', '--survivors'])
      expect(code).toBe(0)
      expect(options).toEqual(
        expect.objectContaining({
          survivors: expect.any(Array),
          mutate: ['src/thing.ts:2:9-2:14'],
          incremental: false,
        }),
      )
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('accepts the --llms global flag', async () => {
    const { code } = await parseArgs(['--llms'])
    expect(code).toBe(0)
  })

  it('accepts a config file as the run positional', async () => {
    const options = await parseSuccess(['run', 'stryker.conf.json'])
    expect(options.configFile).toBe('stryker.conf.json')
  })

  it('accepts a config file positional before options', async () => {
    const options = await parseSuccess(['run', 'stryker.conf.json', '--mutate', 'src/**/*.js'])
    expect(options.configFile).toBe('stryker.conf.json')
    expect(options.mutate).toEqual(['src/**/*.js'])
  })

  it('accepts a config file positional after options', async () => {
    const options = await parseSuccess(['run', '--mutate', 'src/**/*.js', 'stryker.conf.json'])
    expect(options.configFile).toBe('stryker.conf.json')
    expect(options.mutate).toEqual(['src/**/*.js'])
  })

  it('matches flags case-sensitively', async () => {
    const { code } = await parseArgs(['run', '--Mutate', 'src/**/*.js'])
    expect(code).toBe(2)
    const options = await parseSuccess(['run', '--mutate', 'src/**/*.js'])
    expect(options.mutate).toEqual(['src/**/*.js'])
  })

  it.each(['--files', '--allowConsoleColors', '--dashboard.project'])(
    'rejects the removed flag %s',
    async (flag) => {
      const { code } = await parseArgs(['run', flag])
      expect(code).toBe(2)
    },
  )

  it.each(['init', 'serve', 'runServer'])(
    'rejects the removed command %s',
    async (command) => {
      const { code } = await parseArgs([command])
      expect(code).toBe(2)
    },
  )

  it('rejects an invalid choice value', async () => {
    const { code } = await parseArgs(['run', '--coverageAnalysis', 'bogus'])
    expect(code).toBe(2)
  })

  it('rejects an invalid log level', async () => {
    const { code } = await parseArgs(['run', '--logLevel', 'bogus'])
    expect(code).toBe(2)
  })

  it('prints help and exits 0 for --help', async () => {
    const { code } = await parseArgs(['--help'])
    expect(code).toBe(0)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stryker'))
  })

  it('prints help and exits 0 for run --help', async () => {
    const { code } = await parseArgs(['run', '--help'])
    expect(code).toBe(0)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stryker'))
  })

  it('prints the version and exits 0 for --version', async () => {
    const { code } = await parseArgs(['--version'])
    expect(code).toBe(0)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(strykerVersion))
  })

  it('prints help and exits 0 when run with no arguments', async () => {
    const { code } = await parseArgs([])
    expect(code).toBe(0)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stryker'))
  })

  it('loads a JS config file and leaves ${VAR} unsubstituted', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'stryker-cli-spec-'))
    const configFile = path.join(dir, 'stryker.config.js')
    writeFileSync(configFile, 'module.exports = { mutate: ["src/\x24{VAR}.js"] }\n')
    try {
      const options = await parseSuccess(['run', configFile])
      expect(options.configFile).toBe(configFile)
      const reader = new ConfigReader(
        noopLogger,
        new OptionsValidator(forkCoreSchema, noopLogger),
      )
      const fullOptions = await reader.readConfig({ configFile })
      expect(fullOptions.mutate).toEqual(['src/\x24{VAR}.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
