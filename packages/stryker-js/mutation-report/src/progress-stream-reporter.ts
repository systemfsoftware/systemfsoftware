import { MutantResult } from '@stryker-mutator/api/core'
import { commonTokens, PluginContext } from '@stryker-mutator/api/plugin'
import { MutationTestingPlanReadyEvent, Reporter } from '@stryker-mutator/api/report'
import { Injector, tokens } from 'typed-inject'

import { coreTokens } from '@systemfsoftware/stryker-js-mutation-run/di'
import type { RunEventSink } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { isActionableStatus } from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'

/**
 * The machine-mode progress events (R17, R19, R20): the reporter seam that
 * turns the plan and the tested-mutant callbacks into `plan` and `mutant`
 * run events. The sink (U4) is resolved from the plugin creator's injector
 * at construction — the same chain core provided `coreTokens.runEventSink`
 * on — so an unwired chain throws here rather than pushing into a silent
 * no-op (R2). Everything else — the mode gate, the fd-1 write path, the
 * heartbeat, the terminal line — lives on the sink's host side, not here.
 * This reporter writes no lines itself; it stays registered as the fifth
 * surviving reporter name — U9 must not prune it.
 */
export class ProgressStreamReporter implements Reporter {
  public static readonly inject = tokens(commonTokens.injector)

  private total = 0
  private completed = 0

  constructor(injector: Injector<PluginContext & { [coreTokens.runEventSink]: RunEventSink }>) {
    this.runEventSink = injector.resolve(coreTokens.runEventSink)
  }

  private readonly runEventSink: RunEventSink

  public onMutationTestingPlanReady(event: MutationTestingPlanReadyEvent): void {
    this.total = event.mutantPlans.length
    this.runEventSink({ kind: 'plan', total: this.total })
  }

  public onMutantTested(result: MutantResult): void {
    this.completed += 1
    // The R20 actionable filter: a `Killed`, `Ignored`, or `CompileError`
    // mutant is a count only, never a `mutant` line — the shared definition
    // from the verdict envelope, so the lines and `verdict.mutants` can
    // never disagree. The completed counter still counts every tested
    // mutant; the count travels on the events that do get pushed.
    if (!isActionableStatus(result.status)) {
      return
    }
    this.runEventSink({
      kind: 'mutant',
      id: result.id,
      status: result.status,
      file: result.fileName,
      location: result.location,
      mutator: result.mutatorName,
      replacement: result.replacement ?? null,
      completed: this.completed,
      total: this.total,
    })
  }
}
