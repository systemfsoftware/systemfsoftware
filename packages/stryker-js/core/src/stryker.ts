import { MutantResult, PartialStrykerOptions } from '@stryker-mutator/api/core'
import { commonTokens } from '@stryker-mutator/api/plugin'
import { createInjector, Injector } from 'typed-inject'

import { coreTokens } from './di/index.js'
import { ConfigError, retrieveCause } from './errors.js'
import { LoggingBackend, provideLogging, provideLoggingBackend } from './logging/index.js'
import { detectMode, isColorEnabled } from './output-mode.js'
import {
  DryRunExecutor,
  MutantInstrumenterExecutor,
  MutationTestExecutor,
  PrepareExecutor,
  PrepareExecutorArgs,
  PrepareExecutorContext,
} from './process/index.js'
import { emitPhase } from './progress-stream.js'

type MutationRunContext = PrepareExecutorContext & {
  [coreTokens.loggingSink]: LoggingBackend
}

/**
 * The main Stryker class.
 * It provides a single `runMutationTest()` function which runs mutation testing:
 */
export class Stryker {
  /**
   * @constructor
   * @param cliOptions The cli options.
   * @param injectorFactory The injector factory, for testing purposes only
   */
  constructor(
    private readonly cliOptions: PartialStrykerOptions,
    private readonly injectorFactory = createInjector,
  ) {}

  public async runMutationTest(): Promise<MutantResult[]> {
    const rootInjector = this.injectorFactory()
    try {
      // U13 — the log sink follows the resolved mode (R5, KTD13). Machine
      // mode keeps stdout exclusively for the NDJSON stream, so the logging
      // backend is pointed at stderr; human mode keeps the stdout sink. The
      // fix is the descriptor, never the log level — a level change would
      // hide the diagnostics the human path wants and would leave the
      // descriptor wrong for the next caller.
      const resolvedMode = detectMode()
      const logSink = resolvedMode.mode === 'machine' ? process.stderr : process.stdout
      const prepareInjector = provideLogging(
        await provideLoggingBackend(
          rootInjector,
          logSink,
          isColorEnabled(resolvedMode, process.env['NO_COLOR']),
        ),
      ).provideValue(coreTokens.reporterOverride, undefined)
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
    try {
      // 1. Prepare. Load Stryker configuration, load the input files
      // U13 — phase events (R18, KTD14): the Reporter interface exposes no
      // hook before the dry run, so the phases are emitted here, from the
      // executor chain, immediately before each stage. `prepare` is the
      // first observable moment of the run — the true start of the silent
      // window R18 exists to cover. The stream module (U7) owns the mode
      // gate; these calls are no-ops in human mode and before configuration.
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
            coreTokens.temporaryDirectory,
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
