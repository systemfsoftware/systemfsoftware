import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { frameworkPluginsFileUrl } from '@stryker-mutator/instrumenter'
import { noopLogger } from '@stryker-mutator/util'
import {
  type LogLevel,
  type PartialStrykerOptions,
  schema,
  type StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens, declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { Plugin } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import { createInjector, type Injector } from 'typed-inject'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import basePreset from '../../src/config/base-preset.js'
import { createDefaultOptions } from '../../src/config/options-validator.js'
import type { StrykerHostOptions } from '../../src/index.js'
import { provideLogging, provideLoggingBackend } from '../../src/logging/index.js'
import { injectionTokens } from '../../src/plugins/index.js'
import { PluginCreator } from '../../src/plugins/plugin-creator.js'
import { BroadcastReporter } from '../../src/reporting/index.js'
import { type MutantInstrumenterContext, PrepareExecutor } from '../../src/run-stages/index.js'

// `wrapUp` is the driven method — it takes no event argument, so the dispatch
// gate is exercised without fabricating a full MutantResult.
class SpyReporter implements Reporter {
  public readonly wrapUp = vi.fn(async (): Promise<void> => undefined)
}

function createReporterSpies(): Record<'clearText' | 'progress' | 'json', SpyReporter> {
  return {
    clearText: new SpyReporter(),
    progress: new SpyReporter(),
    json: new SpyReporter(),
  }
}

function createBroadcastReporter(
  spies: Record<'clearText' | 'progress' | 'json', SpyReporter>,
  progressEnabled: boolean,
  clearTextEnabled: boolean,
): BroadcastReporter {
  const options: StrykerOptions = {
    ...createDefaultOptions(),
    reporters: ['clear-text', 'progress', 'json'],
  }
  const pluginCreator = new PluginCreator(
    new Map<PluginKind, Plugin<PluginKind>[]>([
      [
        PluginKind.Reporter,
        [
          declareValuePlugin(PluginKind.Reporter, 'clear-text', spies.clearText),
          declareValuePlugin(PluginKind.Reporter, 'progress', spies.progress),
          declareValuePlugin(PluginKind.Reporter, 'json', spies.json),
        ],
      ],
    ]),
    createInjector()
      .provideValue(commonTokens.options, options)
      .provideValue(commonTokens.fileDescriptions, {})
      .provideValue(commonTokens.logger, noopLogger)
      .provideValue(commonTokens.getLogger, () => noopLogger),
  )
  return new BroadcastReporter(options, pluginCreator, noopLogger, undefined, progressEnabled, clearTextEnabled)
}

describe('the default reporter list', () => {
  it('registers the progress-stream reporter, so the stream writer is constructed on every run', () => {
    expect(basePreset.reporters).toContain('progress-stream')
  })
})

describe('the reporter dispatch gates', () => {
  it('skips progress and clear-text when both gates are off, while other reporters still run', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, false, false)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).not.toHaveBeenCalled()
    expect(spies.clearText.wrapUp).not.toHaveBeenCalled()
    expect(spies.json.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('dispatches to progress and clear-text when both gates are on', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, true, true)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).toHaveBeenCalledTimes(1)
    expect(spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('skips only the progress reporter when progress is disabled', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, false, true)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).not.toHaveBeenCalled()
    expect(spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('skips only the clear-text reporter when clear text is disabled', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, true, false)

    await broadcastReporter.wrapUp()

    expect(spies.clearText.wrapUp).not.toHaveBeenCalled()
    expect(spies.progress.wrapUp).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// U4 composition: the host supplies `reporterPluginModules` and the value must
// reach the plugin loader THROUGH the injector. These drive the real prepare
// phase — host options → root injector → PrepareExecutor → plugin loader →
// reporter construction — against the CLI's minimal-project fixture, so a
// value that is not threaded fails loudly. (The later mutation phases spawn
// child-process workers that exist only in the built dist, so the prepare
// phase is the deepest hermetically reachable point of the run.)
// ---------------------------------------------------------------------------

// The minimal-project fixture the CLI smoke run uses: a command test runner
// and a single arithmetic file, so the prepare phase needs no extra runner.
const fixtureDir = fileURLToPath(
  new URL('../../../cli/__tests__/fixtures/minimal-project/', import.meta.url),
)
// The fork's reporter registry, split out of this package into the sibling
// mutation-report package (U6). Addressed through its source file; vitest
// transforms the .ts on import. Its transitive imports of this engine's
// subpaths (`./plugins`, `./timer`, ...) resolve through the built dist, so
// the engine must be built before this spec runs.
const registrySpecifier = new URL(
  '../../../mutation-report/src/stryker-plugins.ts',
  import.meta.url,
).href
// A second real module exporting `strykerPlugins` (Ignore-kind plugins).
const instrumenterSpecifier = new URL(
  '../../node_modules/@stryker-mutator/instrumenter/dist/src/frameworks/index.js',
  import.meta.url,
).href
// A real installed module with no `strykerPlugins` export: the loader must
// diagnose it, never crash on it.
const pluginlessSpecifier = new URL(
  '../../node_modules/@stryker-mutator/util/dist/src/index.js',
  import.meta.url,
).href

// The temp dir name is unique to this file so a concurrent smoke run of the
// same fixture (which uses `.stryker-tmp`) cannot collide with our cleanup.
const TEMP_DIR_NAME = '.stryker-tmp-u4'

function createHostOptions(
  reporterPluginModules: string[],
  clearTextEnabled = false,
): { hostOptions: StrykerHostOptions; capturedLog: string[] } {
  const capturedLog: string[] = []
  // The capture stream only implements `write`; the host type demands a full
  // WriteStream, and the log assertions below verify the captured content.
  const loggerConsoleOut = new Writable({
    write(chunk, _encoding, callback) {
      capturedLog.push(chunk.toString())
      callback()
    },
  }) as unknown as NodeJS.WriteStream
  return {
    hostOptions: {
      loggerConsoleOut,
      showColors: false,
      runEventSink: () => undefined,
      runId: 'u4-reporter-wiring',
      resolvedMode: { mode: 'human', signal: 'tty', stdoutIsTTY: false },
      progressEnabled: false,
      clearTextEnabled,
      runStartedAt: Date.now(),
      reporterPluginModules,
    },
    capturedLog,
  }
}

function runOptions(overrides: PartialStrykerOptions): PartialStrykerOptions {
  return {
    tempDirName: TEMP_DIR_NAME,
    fileLogLevel: 'off' as LogLevel,
    ...overrides,
  }
}

function captureStdout(): { restore: () => void; output: () => string } {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  return {
    restore: () => write.mockRestore(),
    output: () => write.mock.calls.map(([chunk]) => String(chunk)).join(''),
  }
}

// The same injector chain `Stryker.runMutationTest` builds, so the value is
// proven threaded the way the real run threads it. Returns the injector
// PrepareExecutor hands to the instrument phase plus the root dispose handle.
async function executePreparePhase(
  hostOptions: StrykerHostOptions,
  cliOptions: PartialStrykerOptions,
): Promise<{
  injector: Injector<MutantInstrumenterContext>
  dispose: () => Promise<void>
}> {
  const rootInjector = createInjector()
  const prepareInjector = provideLogging(
    await provideLoggingBackend(
      rootInjector,
      hostOptions.loggerConsoleOut,
      hostOptions.showColors,
    ),
  )
    .provideValue(injectionTokens.reporterOverride, undefined)
    .provideValue(injectionTokens.runEventSink, hostOptions.runEventSink)
    .provideValue(injectionTokens.runId, hostOptions.runId)
    .provideValue(injectionTokens.resolvedMode, hostOptions.resolvedMode)
    .provideValue(injectionTokens.progressEnabled, hostOptions.progressEnabled)
    .provideValue(injectionTokens.clearTextEnabled, hostOptions.clearTextEnabled)
    .provideValue(injectionTokens.runStartedAt, hostOptions.runStartedAt)
    .provideValue(
      injectionTokens.reporterPluginModules,
      hostOptions.reporterPluginModules,
    )
  const prepareExecutor = prepareInjector.injectClass(PrepareExecutor)
  const injector = await prepareExecutor.execute({
    cliOptions,
    targetMutatePatterns: undefined,
  })
  return { injector, dispose: () => rootInjector.dispose() }
}

// A report the clear-text reporter can render: two mutants, one killed, so
// the score table prints a non-perfect score.
function createMinimalReport(): schema.MutationTestResult {
  const location: schema.Location = {
    start: { line: 1, column: 0 },
    end: { line: 1, column: 1 },
  }
  return {
    schemaVersion: '2',
    thresholds: { high: 80, low: 60 },
    files: {
      'src/calculator.js': {
        language: 'javascript',
        source: 'export const add = (a, b) => a + b',
        mutants: [
          {
            id: '1',
            mutatorName: 'ArithmeticOperator',
            replacement: '-',
            location,
            status: 'Killed',
          },
          {
            id: '2',
            mutatorName: 'ArithmeticOperator',
            replacement: '*',
            location,
            status: 'Survived',
          },
        ],
      },
    },
  }
}

describe('the reporter plugin module seam (U4)', () => {
  let previousCwd: string

  beforeEach(() => {
    previousCwd = process.cwd()
    process.chdir(fixtureDir)
  })

  afterEach(() => {
    process.chdir(previousCwd)
    rmSync(resolve(fixtureDir, TEMP_DIR_NAME), { recursive: true, force: true })
    rmSync(resolve(fixtureDir, 'stryker.log'), { force: true })
  })

  it('loads zero reporters when the host supplies an empty reporterPluginModules', async () => {
    const { hostOptions } = createHostOptions([])
    const { injector, dispose } = await executePreparePhase(
      hostOptions,
      runOptions({ reporters: ['clear-text'] }),
    )
    try {
      // PrepareExecutor provides pluginsByKind at runtime, but the declared
      // context type omits it, so typed-inject's string token falls outside
      // its key set; the assertions below verify the resolved value.
      // @ts-expect-error pluginsByKind is provided at runtime, not declared on MutantInstrumenterContext
      const pluginsByKind = injector.resolve(injectionTokens.pluginsByKind) as Map<
        PluginKind,
        Plugin<PluginKind>[]
      >
      expect(pluginsByKind.get(PluginKind.Reporter)).toBeUndefined()
      // The configured clear-text reporter cannot be created: the run's
      // ConfigError, never a crash.
      expect(() => injector.resolve(injectionTokens.reporter)).toThrow(
        /no Reporter plugins were loaded/,
      )
    } finally {
      await dispose()
    }
  }, 30_000)

  it('completes the prepare phase with empty reporterPluginModules and emits no reporter output', async () => {
    const stdout = captureStdout()
    const { hostOptions } = createHostOptions([])
    const { injector, dispose } = await executePreparePhase(
      hostOptions,
      runOptions({ reporters: [] }),
    )
    try {
      const broadcastReporter = injector.resolve(injectionTokens.reporter)
      await broadcastReporter.wrapUp()
      expect(stdout.output()).not.toContain('% Mutation score')
    } finally {
      stdout.restore()
      await dispose()
    }
  }, 30_000)

  it('emits the clear-text score when the host supplies the reporter registry specifier', async () => {
    const stdout = captureStdout()
    const { hostOptions } = createHostOptions([registrySpecifier], true)
    const { injector, dispose } = await executePreparePhase(
      hostOptions,
      runOptions({ reporters: ['clear-text'] }),
    )
    try {
      const broadcastReporter = injector.resolve(injectionTokens.reporter)
      const report = createMinimalReport()
      broadcastReporter.onMutationTestReportReady(
        report,
        calculateMutationTestMetrics(report),
      )
      await broadcastReporter.wrapUp()
      expect(stdout.output()).toContain('% Mutation score')
    } finally {
      stdout.restore()
      await dispose()
    }
  }, 30_000)

  it('loads every supplied specifier and merges with plugins and appendPlugins in the existing order', async () => {
    const { hostOptions, capturedLog } = createHostOptions(
      [instrumenterSpecifier, registrySpecifier],
      true,
    )
    const { injector, dispose } = await executePreparePhase(
      hostOptions,
      runOptions({
        reporters: ['clear-text'],
        plugins: [registrySpecifier],
        appendPlugins: [instrumenterSpecifier],
        logLevel: 'debug' as LogLevel,
      }),
    )
    try {
      // The plugin loader logs one "Loading plugin" debug line per descriptor,
      // in the exact order PrepareExecutor builds them: options.plugins first,
      // then the framework plugins, then the host's reporterPluginModules,
      // then options.appendPlugins.
      const loadingLines = [
        ...capturedLog.join('').matchAll(/Loading plugin ([^\n]+)/g),
      ].map((match) => match[1])
      expect(loadingLines).toEqual([
        registrySpecifier,
        frameworkPluginsFileUrl,
        instrumenterSpecifier,
        registrySpecifier,
        instrumenterSpecifier,
      ])
      // @ts-expect-error pluginsByKind is provided at runtime, not declared on MutantInstrumenterContext
      const pluginsByKind = injector.resolve(injectionTokens.pluginsByKind) as Map<
        PluginKind,
        Plugin<PluginKind>[]
      >
      expect(
        pluginsByKind.get(PluginKind.Reporter)?.map((plugin) => plugin.name),
      ).toEqual(expect.arrayContaining(['clear-text']))
      expect(pluginsByKind.get(PluginKind.Ignore)?.length).toBeGreaterThan(0)
    } finally {
      await dispose()
    }
  }, 30_000)

  it('diagnoses a specifier whose module has no strykerPlugins export instead of crashing', async () => {
    const { hostOptions, capturedLog } = createHostOptions([pluginlessSpecifier])
    const { dispose } = await executePreparePhase(
      hostOptions,
      runOptions({ reporters: [] }),
    )
    try {
      const log = capturedLog.join('')
      expect(log).toContain('did not contribute a StrykerJS plugin')
      expect(log).toContain(pluginlessSpecifier)
    } finally {
      await dispose()
    }
  }, 30_000)
})
