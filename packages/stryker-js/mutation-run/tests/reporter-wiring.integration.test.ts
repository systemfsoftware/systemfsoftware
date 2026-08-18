/**
 * Reporter wiring: the dispatch gates suppress progress and clear-text
 * reporters per the host-resolved flags while the other reporters still run,
 * and the reporter plugin module seam (U4) proves host-supplied module
 * specifiers reach the plugin loader through the injector — an empty list
 * loads nothing, the merged registry loads in the configured order, and a
 * module without a strykerPlugins export is diagnosed instead of crashing.
 * The prepare-phase scenarios drive the real PrepareExecutor against the
 * CLI's minimal-project fixture, so a value that is not threaded fails
 * loudly.
 */
import { frameworkPluginsFileUrl } from '@stryker-mutator/instrumenter'
import { noopLogger } from '@stryker-mutator/util'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens, declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { Plugin } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import { Effect } from 'effect'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInjector, type Injector } from 'typed-inject'
import { expect, vi } from 'vitest'

import { createDefaultOptions } from '../src/config/options-validator.js'
import type { StrykerHostOptions } from '../src/index.js'
import { provideLogging, provideLoggingBackend } from '../src/logging/index.js'
import { injectionTokens } from '../src/plugins/index.js'
import { PluginCreator } from '../src/plugins/plugin-creator.js'
import { BroadcastReporter } from '../src/reporting/index.js'
import { type MutantInstrumenterContext, PrepareExecutor } from '../src/run-stages/index.js'

const Feature = makeFeature({ it, layer })

/** A non-error outcome message, or the error's own message when it is one. */
const outcomeMessage = (outcome: unknown): string => outcome instanceof Error ? outcome.message : String(outcome)

// `wrapUp` is the driven method — it takes no event argument, so the dispatch
// gate is exercised without fabricating a full MutantResult.
class SpyReporter implements Reporter {
  public readonly wrapUp = vi.fn<() => Promise<void>>(async () => undefined)
}

const createReporterSpies = (): Record<'clearText' | 'progress' | 'json', SpyReporter> => ({
  clearText: new SpyReporter(),
  progress: new SpyReporter(),
  json: new SpyReporter(),
})

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

// ---------------------------------------------------------------------------
// U4 composition: host options → root injector → PrepareExecutor → plugin
// loader → reporter construction. The later mutation phases spawn
// child-process workers that exist only in the built dist, so the prepare
// phase is the deepest hermetically reachable point of the run.
// ---------------------------------------------------------------------------

// The minimal-project fixture the CLI smoke run uses: a command test runner
// and a single arithmetic file, so the prepare phase needs no extra runner.
const fixtureDir = new URL('../../cli/tests/__fixtures__/fixtures/minimal-project/', import.meta.url)
// The fork's reporter registry, split out of this package into the sibling
// mutation-report package (U6). Addressed through its source file; vitest
// transforms the .ts on import. Its transitive imports of this engine's
// subpaths (`./plugins`, `./timer`, ...) resolve through the built dist, so
// the engine must be built before this spec runs.
const registrySpecifier = new URL(
  '../../mutation-report/src/stryker-plugins.ts',
  import.meta.url,
).href
// A second real module exporting `strykerPlugins` (Ignore-kind plugins).
const instrumenterSpecifier = new URL(
  '../node_modules/@stryker-mutator/instrumenter/dist/src/frameworks/index.js',
  import.meta.url,
).href
// A real installed module with no `strykerPlugins` export: the loader must
// diagnose it, never crash on it.
const pluginlessSpecifier = new URL(
  '../node_modules/@stryker-mutator/util/dist/src/index.js',
  import.meta.url,
).href

// The temp dir name is unique to this file so a concurrent smoke run of the
// same fixture (which uses `.stryker-tmp`) cannot collide with our cleanup.
const TEMP_DIR_NAME = '.stryker-tmp-u4'

function createHostOptions(
  reporterPluginModules: string[],
  clearTextEnabled = false,
): StrykerHostOptions {
  return {
    loggerConsoleOut: process.stdout,
    showColors: false,
    runEventSink: () => undefined,
    runId: 'u4-reporter-wiring',
    resolvedMode: { mode: 'human', signal: 'tty', stdoutIsTTY: false },
    progressEnabled: false,
    clearTextEnabled,
    runStartedAt: Date.now(),
    reporterPluginModules,
  }
}

const runOptions = (overrides: PartialStrykerOptions): PartialStrykerOptions => ({
  tempDirName: TEMP_DIR_NAME,
  fileLogLevel: 'off',
  ...overrides,
})

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

/** Runs in the fixture directory, then restores cwd and removes temp files. */
async function runInFixture<A>(run: () => Promise<A>): Promise<A> {
  const previousCwd = process.cwd()
  process.chdir(fixtureDir.pathname)
  try {
    return await run()
  } finally {
    process.chdir(previousCwd)
    rmSync(resolve(fixtureDir.pathname, TEMP_DIR_NAME), { recursive: true, force: true })
    rmSync(resolve(fixtureDir.pathname, 'stryker.log'), { force: true })
  }
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

Feature('Reporter dispatch gates and the plugin module seam')
  .body(({ scenario }) => {
    scenario(
      'Should_SkipProgressAndClearText_When_BothGatesAreOff',
      Gherkin.Do.pipe(
        Given('a broadcast reporter over three spies with both gates off')('lane', () =>
          Effect.sync(() => {
            const spies = createReporterSpies()
            return { spies, broadcast: createBroadcastReporter(spies, false, false) }
          })),
        When('all reporters are told to wrap up')(
          'lane',
          (s) => Effect.promise(() => s.lane.broadcast.wrapUp().then(() => s.lane)),
        ),
        Then('only the reporter outside the gates ran')((s) => {
          expect(s.lane.spies.progress.wrapUp).not.toHaveBeenCalled()
          expect(s.lane.spies.clearText.wrapUp).not.toHaveBeenCalled()
          expect(s.lane.spies.json.wrapUp).toHaveBeenCalledTimes(1)
        }),
      ),
    )

    scenario(
      'ShouldDispatchEveryBuiltInReporter_When_BothGatesAreOn',
      Gherkin.Do.pipe(
        Given('a broadcast reporter over three spies with both gates on')('lane', () =>
          Effect.sync(() => {
            const spies = createReporterSpies()
            return { spies, broadcast: createBroadcastReporter(spies, true, true) }
          })),
        When('all reporters are told to wrap up')(
          'lane',
          (s) => Effect.promise(() => s.lane.broadcast.wrapUp().then(() => s.lane)),
        ),
        Then('the progress and clear-text spies ran')((s) => {
          expect(s.lane.spies.progress.wrapUp).toHaveBeenCalledTimes(1)
          expect(s.lane.spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
        }),
      ),
    )

    scenario(
      'ShouldSkipOnlyProgress_When_ProgressIsDisabled',
      Gherkin.Do.pipe(
        Given('a broadcast reporter with progress disabled')('lane', () =>
          Effect.sync(() => {
            const spies = createReporterSpies()
            return { spies, broadcast: createBroadcastReporter(spies, false, true) }
          })),
        When('all reporters are told to wrap up')(
          'lane',
          (s) => Effect.promise(() => s.lane.broadcast.wrapUp().then(() => s.lane)),
        ),
        Then('progress is skipped and clear-text still runs')((s) => {
          expect(s.lane.spies.progress.wrapUp).not.toHaveBeenCalled()
          expect(s.lane.spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
        }),
      ),
    )

    scenario(
      'Should_SkipOnlyClearText_When_ClearTextIsDisabled',
      Gherkin.Do.pipe(
        Given('a broadcast reporter with clear text disabled')('lane', () =>
          Effect.sync(() => {
            const spies = createReporterSpies()
            return { spies, broadcast: createBroadcastReporter(spies, true, false) }
          })),
        When('all reporters are told to wrap up')(
          'lane',
          (s) => Effect.promise(() => s.lane.broadcast.wrapUp().then(() => s.lane)),
        ),
        Then('clear-text is skipped and progress still runs')((s) => {
          expect(s.lane.spies.clearText.wrapUp).not.toHaveBeenCalled()
          expect(s.lane.spies.progress.wrapUp).toHaveBeenCalledTimes(1)
        }),
      ),
    )

    scenario(
      'Should_LoadZeroReporterPlugins_When_TheHostSuppliesAnEmptyModuleList',
      Gherkin.Do.pipe(
        Given('a host with no reporter plugin modules')('host', () => Effect.sync(() => createHostOptions([]))),
        When('the prepare phase runs with a clear-text reporter configured')(
          'phase',
          (s) =>
            Effect.promise(() =>
              runInFixture(() =>
                executePreparePhase(
                  s.host,
                  runOptions({ reporters: ['clear-text'] }),
                )
              ).then(async ({ injector }) => {
                const attempt = (): unknown => {
                  try {
                    injector.resolve(injectionTokens.reporter)
                    return undefined
                  } catch (caught) {
                    return caught
                  }
                }
                return { reporterError: attempt() }
              })
            ),
        ),
        Then('the run reports that no Reporter plugins were loaded')((s) => {
          expect(outcomeMessage(s.phase.reporterError)).toContain('no Reporter plugins were loaded')
        }),
      ),
    )

    scenario(
      'Should_EmitNoReporterOutput_When_NoReporterPluginIsLoaded',
      Gherkin.Do.pipe(
        Given('a host with an empty module list and no configured reporters')(
          'host',
          () => Effect.sync(() => createHostOptions([])),
        ),
        When('the prepare phase completes and the reporter wraps up')('phase', (s) =>
          Effect.promise(async () => {
            const stdout = captureStdout()
            try {
              const run = await runInFixture(() =>
                executePreparePhase(
                  s.host,
                  runOptions({ reporters: [] }),
                )
              )
              const broadcastReporter = run.injector.resolve(injectionTokens.reporter)
              await broadcastReporter.wrapUp()
              await run.dispose()
              return { output: stdout.output() }
            } finally {
              stdout.restore()
            }
          })),
        Then('no mutation score reaches stdout')((s) => {
          expect(s.phase.output).not.toContain('% Mutation score')
        }),
      ),
    )

    scenario(
      'Should_EmitTheClearTextScore_When_TheHostSuppliesTheRegistrySpecifier',
      Gherkin.Do.pipe(
        Given('a host supplying the reporter registry specifier')(
          'host',
          () => Effect.sync(() => createHostOptions([registrySpecifier], true)),
        ),
        When('the clear-text reporter receives a report and wraps up')('phase', (s) =>
          Effect.promise(async () => {
            const output = captureStdout()
            try {
              const phase = await runInFixture(() =>
                executePreparePhase(
                  s.host,
                  runOptions({ reporters: ['clear-text'] }),
                )
              )
              const broadcastReporter = phase.injector.resolve(injectionTokens.reporter)
              const report = createMinimalReport()
              broadcastReporter.onMutationTestReportReady(
                report,
                calculateMutationTestMetrics(report),
              )
              await broadcastReporter.wrapUp()
              await phase.dispose()
              return { output: output.output() }
            } finally {
              output.restore()
            }
          })),
        Then('the clear-text score reaches the console')((s) => {
          expect(s.phase.output).toContain('% Mutation score')
        }),
      ),
    )

    scenario(
      'Should_LoadEverySpecifierInTheConfiguredOrder_When_HostModulesMergeWithPlugins',
      Gherkin.Do.pipe(
        Given('a host supplying both the instrumenter and the registry specifiers')(
          'host',
          () => Effect.sync(() => createHostOptions([instrumenterSpecifier, registrySpecifier], true)),
        ),
        When('the prepare phase merges plugins, appendPlugins and host modules')(
          'phase',
          (s) =>
            Effect.promise(async () => {
              const output = captureStdout()
              try {
                const phase = await runInFixture(() =>
                  executePreparePhase(
                    s.host,
                    runOptions({
                      reporters: ['clear-text'],
                      plugins: [registrySpecifier],
                      appendPlugins: [instrumenterSpecifier],
                      logLevel: 'debug',
                    }),
                  )
                )
                const loadingLines = [
                  ...output.output().matchAll(/Loading plugin ([^\n]+)/g),
                ].map((match) => match[1])
                await phase.dispose()
                return { loadingLines }
              } finally {
                output.restore()
              }
            }),
        ),
        Then('plugins, framework, host modules and appendPlugins load in order')((s) => {
          expect(s.phase.loadingLines).toEqual([
            registrySpecifier,
            frameworkPluginsFileUrl,
            instrumenterSpecifier,
            registrySpecifier,
            instrumenterSpecifier,
          ])
        }),
      ),
    )

    scenario(
      'Should_DiagnoseAPluginlessModule_When_ItDoesNotContributePlugins',
      Gherkin.Do.pipe(
        Given('a host supplying the pluginless util module')(
          'host',
          () => Effect.sync(() => createHostOptions([pluginlessSpecifier])),
        ),
        When('the prepare phase loads the module')('phase', (s) =>
          Effect.promise(async () => {
            const output = captureStdout()
            try {
              const phase = await runInFixture(() =>
                executePreparePhase(
                  s.host,
                  runOptions({ reporters: [] }),
                )
              )
              await phase.dispose()
              return { log: output.output() }
            } finally {
              output.restore()
            }
          })),
        Then('the loader names the missing export and never crashes')((s) => {
          expect(s.phase.log).toContain('did not contribute a StrykerJS plugin')
          expect(s.phase.log).toContain(pluginlessSpecifier)
        }),
      ),
    )
  })
