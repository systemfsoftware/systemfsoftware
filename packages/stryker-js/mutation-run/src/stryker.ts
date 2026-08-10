import { MutantResult, PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { createInjector, Injector } from 'typed-inject'

import { ConfigError, retrieveCause } from './errors.js'
import { LoggingBackend, provideLogging, provideLoggingBackend } from './logging/index.js'
import type { ResolvedMode } from './output-mode.js'
import { injectionTokens } from './plugins/index.js'
import type { RunEventSink, RunPhase } from './run-event.js'
import {
  DryRunExecutor,
  MutantInstrumenterExecutor,
  MutationTestExecutor,
  PrepareExecutor,
  PrepareExecutorArgs,
  PrepareExecutorContext,
} from './run-stages/index.js'

type MutationRunContext = PrepareExecutorContext & {
  [injectionTokens.loggingSink]: LoggingBackend
}

/**
 * What the host (the CLI composition root) resolved once and hands to core
 * alongside the cli options: the log descriptor and its colour flag, the
 * run-event sink, and the run's identity and timing. Core receives these as
 * data — it never probes the terminal — and an unwired host is a compile
 * error, never a silent no-op (R2).
 */
export interface StrykerHostOptions {
  /** The writable the logging backend writes to (stderr in machine mode, stdout otherwise). */
  readonly loggerConsoleOut: NodeJS.WriteStream
  readonly showColors: boolean
  readonly runEventSink: RunEventSink
  /** The run id shared with the stream header and the verdict envelope. */
  readonly runId: string
  /** The mode resolved once at the edge, and the signal that decided it. */
  readonly resolvedMode: ResolvedMode
  readonly progressEnabled: boolean
  readonly clearTextEnabled: boolean
  /** The run's clock zero: `elapsedMs` values measure from here. */
  readonly runStartedAt: number
  /** The module specifiers whose `strykerPlugins` the run loads, resolved by the host (U4). */
  readonly reporterPluginModules: string[]
}

/**
 * The main Stryker class.
 * It provides a single `runMutationTest()` function which runs mutation testing:
 */
export class Stryker {
  /**
   * @constructor
   * @param cliOptions The cli options.
   * @param hostOptions What the host resolved for this run, see {@link StrykerHostOptions}.
   * @param injectorFactory The injector factory, for testing purposes only
   */
  constructor(
    private readonly cliOptions: PartialStrykerOptions,
    private readonly hostOptions: StrykerHostOptions,
    private readonly injectorFactory = createInjector,
  ) {}

  public async runMutationTest(): Promise<MutantResult[]> {
    const rootInjector = this.injectorFactory()
    try {
      // The log descriptor and the colour flag arrive already resolved
      // (U13): machine mode keeps stdout exclusively for the NDJSON stream,
      // so the host points the logging backend at stderr; human mode keeps
      // the stdout sink. The fix is the descriptor, never the log level — a
      // level change would hide the diagnostics the human path wants and
      // would leave the descriptor wrong for the next caller.
      const prepareInjector = provideLogging(
        await provideLoggingBackend(
          rootInjector,
          this.hostOptions.loggerConsoleOut,
          this.hostOptions.showColors,
        ),
      )
        .provideValue(injectionTokens.reporterOverride, undefined)
        .provideValue(injectionTokens.runEventSink, this.hostOptions.runEventSink)
        .provideValue(injectionTokens.runId, this.hostOptions.runId)
        .provideValue(injectionTokens.resolvedMode, this.hostOptions.resolvedMode)
        .provideValue(
          injectionTokens.progressEnabled,
          this.hostOptions.progressEnabled,
        )
        .provideValue(
          injectionTokens.clearTextEnabled,
          this.hostOptions.clearTextEnabled,
        )
        .provideValue(injectionTokens.runStartedAt, this.hostOptions.runStartedAt)
        .provideValue(
          injectionTokens.reporterPluginModules,
          this.hostOptions.reporterPluginModules,
        )
      return await Stryker.run(prepareInjector, {
        cliOptions: this.cliOptions,
        targetMutatePatterns: undefined,
      })
    } finally {
      await rootInjector.dispose()
    }
  }

  /**
   * Does the actual mutation testing.
   * Note: this is a public static method, so it can be reused from `StrykerServer`
   * @internal
   */
  static async run(
    mutationRunInjector: Injector<MutationRunContext>,
    args: PrepareExecutorArgs,
  ): Promise<MutantResult[]> {
    // Resolved once, at the top: the phase pushes and their elapsed times
    // share one sink and one clock zero.
    const sink = mutationRunInjector.resolve(injectionTokens.runEventSink)
    const runStartedAt = mutationRunInjector.resolve(injectionTokens.runStartedAt)
    const emitPhase = (phase: RunPhase): void => {
      sink({ kind: 'phase', phase, elapsedMs: Date.now() - runStartedAt })
    }
    try {
      // 1. Prepare. Load Stryker configuration, load the input files
      // U13 — phase events (R18, KTD14): the Reporter interface exposes no
      // hook before the dry run, so the phases are pushed here, from the
      // executor chain, immediately before each stage. `prepare` is the
      // first observable moment of the run — the true start of the silent
      // window R18 exists to cover. Whether an event renders is the host
      // sink's decision, not core's.
      emitPhase('prepare')
      const prepareExecutor = mutationRunInjector.injectClass(PrepareExecutor)
      const mutantInstrumenterInjector = await prepareExecutor.execute(args)

      try {
        // 2. Mutate and instrument the files and write to the sandbox.
        emitPhase('instrument')
        const mutantInstrumenter = mutantInstrumenterInjector.injectClass(
          MutantInstrumenterExecutor,
        )
        const dryRunExecutorInjector = await mutantInstrumenter.execute()

        // 3. Perform a 'dry run' (initial test run). Runs the tests without active mutants and collects coverage.
        emitPhase('dry-run')
        const dryRunExecutor = dryRunExecutorInjector.injectClass(DryRunExecutor)
        const mutationRunExecutorInjector = await dryRunExecutor.execute()

        // 4. Actual mutation testing. Will check every mutant and if valid run it in an available test runner.
        emitPhase('mutation-test')
        const mutationRunExecutor = mutationRunExecutorInjector.injectClass(MutationTestExecutor)
        const mutantResults = await mutationRunExecutor.execute()

        return mutantResults
      } catch (error) {
        if (
          mutantInstrumenterInjector.resolve(commonTokens.options)
            .cleanTempDir !== 'always'
        ) {
          const log = mutationRunInjector.resolve(commonTokens.getLogger)(
            Stryker.name,
          )
          log.debug('Not removing the temp dir because an error occurred')
          mutantInstrumenterInjector.resolve(
            injectionTokens.temporaryDirectory,
          ).removeDuringDisposal = false
        }
        throw error
      }
    } catch (error) {
      const log = mutationRunInjector.resolve(commonTokens.getLogger)(
        Stryker.name,
      )
      const cause = retrieveCause(error)
      if (cause instanceof ConfigError) {
        log.error(cause.message)
      } else {
        log.error('Unexpected error occurred while running Stryker', error)
        log.info(
          'This might be a known problem with a solution documented in our troubleshooting guide.',
        )
        log.info(
          'You can find it at https://stryker-mutator.io/docs/stryker-js/troubleshooting/',
        )
        if (!log.isTraceEnabled()) {
          log.info(
            'Still having trouble figuring out what went wrong? Try `npx stryker run --fileLogLevel trace --logLevel debug` to get some more info.',
          )
        }
      }
      throw cause
    }
  }
}
