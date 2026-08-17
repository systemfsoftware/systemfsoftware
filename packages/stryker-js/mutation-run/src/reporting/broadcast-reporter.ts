import { type MutantResult, schema, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import {
  type DryRunCompletedEvent,
  type MutationTestingPlanReadyEvent,
  type Reporter,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import { type MutationTestMetricsResult } from 'mutation-testing-metrics'
import { tokens } from 'typed-inject'

import { injectionTokens, PluginCreator } from '../plugins/index.js'

import { type StrictReporter } from './strict-reporter.js'

export class BroadcastReporter implements StrictReporter {
  public static readonly inject = tokens(
    commonTokens.options,
    injectionTokens.pluginCreator,
    commonTokens.logger,
    injectionTokens.reporterOverride,
    injectionTokens.progressEnabled,
    injectionTokens.clearTextEnabled,
  )

  public readonly reporters: Record<string, Reporter>

  /**
   * The progress bar's gate, resolved by the host once at the edge (U13):
   * human mode on a non-TTY stdout suppresses the bar so its control
   * sequences never reach a pipe. Received as data — core no longer probes
   * the terminal.
   */
  private readonly progressEnabled: boolean

  /**
   * The clear-text reporter's gate, resolved by the host once at the edge
   * (U13): machine mode keeps stdout exclusively for the NDJSON stream, so
   * the prose reporter is dropped before dispatch. Received as data — core
   * no longer probes the terminal.
   */
  private readonly clearTextEnabled: boolean

  constructor(
    private readonly options: StrykerOptions,
    private readonly pluginCreator: PluginCreator,
    private readonly log: Logger,
    private readonly reporterOverride: Reporter | undefined,
    progressEnabled: boolean,
    clearTextEnabled: boolean,
  ) {
    this.progressEnabled = progressEnabled
    this.clearTextEnabled = clearTextEnabled
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
    // constructor-injected gates suppress the bar and the clear-text
    // reporter at dispatch rather than renaming them.
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
    call: (reporter: Reporter) => Promise<void> | void,
  ): Promise<void[]> {
    return Promise.all(
      Object.entries(this.reporters).map(async ([reporterName, reporter]) => {
        if (
          (reporterName === 'progress' && !this.progressEnabled) ||
          (reporterName === 'clear-text' && !this.clearTextEnabled)
        ) {
          return
        }
        try {
          await call(reporter)
        } catch (error) {
          this.handleError(error, methodName, reporterName)
        }
      }),
    )
  }

  public onDryRunCompleted(event: DryRunCompletedEvent): void {
    void this.broadcast('onDryRunCompleted', (reporter) => reporter.onDryRunCompleted?.(event))
  }
  public onMutationTestingPlanReady(
    event: MutationTestingPlanReadyEvent,
  ): void {
    void this.broadcast('onMutationTestingPlanReady', (reporter) => reporter.onMutationTestingPlanReady?.(event))
  }

  public onMutantTested(result: MutantResult): void {
    void this.broadcast('onMutantTested', (reporter) => reporter.onMutantTested?.(result))
  }

  public onMutationTestReportReady(
    report: schema.MutationTestResult,
    metrics: MutationTestMetricsResult,
  ): void {
    void this.broadcast(
      'onMutationTestReportReady',
      (reporter) => reporter.onMutationTestReportReady?.(report, metrics),
    )
  }

  public async wrapUp(): Promise<void> {
    await this.broadcast('wrapUp', (reporter) => reporter.wrapUp?.())
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
