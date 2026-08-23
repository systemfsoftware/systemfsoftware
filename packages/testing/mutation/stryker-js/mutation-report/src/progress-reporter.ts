import type { MutantResult } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import { ReporterFailed } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Effect from 'effect/Effect'

import { ProgressBar } from './progress-bar.js'
import { ProgressKeeper } from './progress-keeper.js'

class Keeper extends ProgressKeeper {
  public dryRun(event: DryRunCompletedEvent): void {
    this.handleDryRunCompleted(event)
  }
  public planReady(event: MutationTestingPlanReadyEvent): void {
    this.handleMutationTestingPlanReady(event)
  }
  public mutantTested(result: MutantResult): number {
    return this.handleMutantTested(result)
  }
  public elapsed(): string {
    return this.getElapsedTime()
  }
  public etcVal(): string {
    return this.getEtc()
  }
  public get snapshot() {
    return { ...this.progress }
  }
}

export class ProgressBarReporter implements ReporterService {
  private readonly keeper = new Keeper()
  private progressBar?: ProgressBar

  public readonly onDryRunCompleted = (event: DryRunCompletedEvent) =>
    Effect.try({
      try: () => {
        this.keeper.dryRun(event)
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onDryRunCompleted', cause }),
    })

  public readonly onMutationTestingPlanReady = (event: MutationTestingPlanReadyEvent) =>
    Effect.try({
      try: () => {
        this.keeper.planReady(event)
        const barFormat =
          'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'
        this.progressBar = new ProgressBar(barFormat, {
          complete: '=',
          incomplete: ' ',
          stream: process.stdout,
          total: this.keeper.snapshot.total,
          width: 50,
        })
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutationTestingPlanReady', cause }),
    })

  public readonly onMutantTested = (result: MutantResult) =>
    Effect.try({
      try: () => {
        const ticks = this.keeper.mutantTested(result)
        const snapshot = this.keeper.snapshot
        const data: Record<string, string | number> = {
          ...snapshot,
          et: this.keeper.elapsed(),
          etc: this.keeper.etcVal(),
        }
        if (ticks) {
          this.progressBar?.tick(ticks, data)
        } else if (this.progressBar?.total) {
          this.progressBar.render(data)
        }
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutantTested', cause }),
    })

  public readonly onMutationTestReportReady = (
    _report: schema.MutationTestResult,
    _metrics: MutationTestMetricsResult,
  ) => Effect.void

  public readonly wrapUp = Effect.void
}
