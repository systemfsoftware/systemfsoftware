import { MutantResult } from '@stryker-mutator/api/core'
import { MutationTestingPlanReadyEvent, Reporter } from '@stryker-mutator/api/report'

import { emitMutant, emitPlan, recordProgress } from '../progress-stream.js'

/**
 * U7 — the machine-mode progress stream on stdout (R17, R19, R20).
 *
 * A thin caller on the shared stream module (`../progress-stream.js`): it
 * feeds the module the plan and the tested-mutant events from the existing
 * reporter seams (`onMutationTestingPlanReady` / `onMutantTested`), and the
 * module owns everything else — the mode gate, the fd-1 `writeSync` path, the
 * run id, the heartbeat, and the terminal line. This reporter writes no lines
 * itself and detects no mode; it stays registered as the fifth surviving
 * reporter name — U9 must not prune it.
 */
export class ProgressStreamReporter implements Reporter {
  private total = 0
  private completed = 0

  public onMutationTestingPlanReady(event: MutationTestingPlanReadyEvent): void {
    this.total = event.mutantPlans.length
    emitPlan(this.total)
  }

  public onMutantTested(result: MutantResult): void {
    this.completed += 1
    recordProgress(this.completed, this.total)
    emitMutant({
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
