import { MutantResult, schema, StrykerOptions } from '@stryker-mutator/api/core'
import { Logger } from '@stryker-mutator/api/logging'
import { commonTokens, PluginKind } from '@stryker-mutator/api/plugin'
import { DryRunCompletedEvent, MutationTestingPlanReadyEvent, Reporter } from '@stryker-mutator/api/report'
import { MutationTestMetricsResult } from 'mutation-testing-metrics'
import { tokens } from 'typed-inject'

import { coreTokens, PluginCreator } from '../di/index.js'
import { detectMode, isProgressEnabled } from '../output-mode.js'

import { StrictReporter } from './strict-reporter.js'

export class BroadcastReporter implements StrictReporter {
  public static readonly inject = tokens(
    commonTokens.options,
    coreTokens.pluginCreator,
    commonTokens.logger,
    coreTokens.reporterOverride,
  )

  public readonly reporters: Record<string, Reporter>

  /**
   * Machine mode's stdout belongs to the NDJSON stream alone (R5): the prose
   * reporters write to fd 1 with no mode awareness of their own, so this
   * boundary drops them before dispatch. Resolved once here, at construction,
   * from the same detection inputs as `progressEnabled`.
   */
  private readonly machineMode: boolean

  /**
   * The progress bar's gate. Human mode on a non-TTY stdout suppresses the
   * bar so its control sequences never reach a pipe (U3). Resolved once here,
   * at construction, from the same detection inputs that decide the run's
   * mode — never a second `process.stdout.isTTY` probe at each print site.
   */
  private readonly progressEnabled: boolean

  constructor(
    private readonly options: StrykerOptions,
    private readonly pluginCreator: PluginCreator,
    private readonly log: Logger,
    private readonly reporterOverride: Reporter | undefined,
  ) {
    const resolved = detectMode()
    this.machineMode = resolved.mode === 'machine'
    this.progressEnabled = isProgressEnabled(resolved)
    this.reporters = {}
    if (this.reporterOverride) {
      this.reporters['in-memory'] = this.reporterOverride
    } else {
      this.options.reporters.forEach((reporterName) => this.createReporter(reporterName))
    }
    this.logAboutReporters()
  }

  private createReporter(reporterName: string): void {
    // The former non-TTY downgrade of 'progress' to 'progress-append-only'
    // (U3) is gone: the run's resolved mode decides instead, and the
    // broadcast call site passes `progressEnabled` down to the dispatch, so
    // the bar is suppressed rather than renamed.
    this.reporters[reporterName] = this.pluginCreator.create(
      PluginKind.Reporter,
      reporterName,
    )
  }

  private logAboutReporters(): void {
    const reporterNames = Object.keys(this.reporters)
    if (reporterNames.length) {
      if (this.log.isDebugEnabled()) {
        this.log.debug(
          `Broadcasting to reporters ${JSON.stringify(reporterNames)}`,
        )
      }
    } else {
      this.log.warn(
        "No reporter configured. Please configure one or more reporters in the (for example: reporters: ['progress'])",
      )
    }
  }

  private broadcast<TMethod extends keyof Reporter>(
    methodName: TMethod,
    ...eventArgs: Parameters<Required<Reporter>[TMethod]>
  ): Promise<void[]> {
    return Promise.all(
      Object.entries(this.reporters).map(async ([reporterName, reporter]) => {
        if (
          (reporterName === 'progress' && !this.progressEnabled) ||
          (reporterName === 'clear-text' && this.machineMode)
        ) {
          return
        }
        if (reporter[methodName]) {
          try {
            await (
              reporter[methodName] as (
                ...args: Parameters<Required<Reporter>[TMethod]>
              ) => Promise<void> | void
            )(...eventArgs)
          } catch (error) {
            this.handleError(error, methodName, reporterName)
          }
        }
      }),
    )
  }

  public onDryRunCompleted(event: DryRunCompletedEvent): void {
    void this.broadcast('onDryRunCompleted', event)
  }
  public onMutationTestingPlanReady(
    event: MutationTestingPlanReadyEvent,
  ): void {
    void this.broadcast('onMutationTestingPlanReady', event)
  }

  public onMutantTested(result: MutantResult): void {
    void this.broadcast('onMutantTested', result)
  }

  public onMutationTestReportReady(
    report: schema.MutationTestResult,
    metrics: MutationTestMetricsResult,
  ): void {
    void this.broadcast('onMutationTestReportReady', report, metrics)
  }

  public async wrapUp(): Promise<void> {
    await this.broadcast('wrapUp')
  }

  private handleError(
    error: unknown,
    methodName: string,
    reporterName: string,
  ) {
    this.log.error(
      `An error occurred during '${methodName}' on reporter '${reporterName}'.`,
      error,
    )
  }
}
