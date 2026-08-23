import {
  type MutantResult,
  type MutantRunPlan,
  type MutantTestPlan,
  PlanKind,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  RunTiming,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import type { TestRunnerCapabilities } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

import { Timer } from './timer.js'

export abstract class ProgressKeeper {
  private timer!: Timer
  private timing!: RunTiming
  private capabilities!: TestRunnerCapabilities
  private ticksByMutantId = new Map<string, number>()

  protected progress = {
    survived: 0,
    timedOut: 0,
    tested: 0,
    mutants: 0,
    total: 0,
    ticks: 0,
  }

  protected handleDryRunCompleted({ timing, capabilities }: DryRunCompletedEvent): void {
    this.timing = timing
    this.capabilities = capabilities
  }

  protected handleMutationTestingPlanReady({ mutantPlans }: MutationTestingPlanReadyEvent): void {
    this.timer = new Timer()
    this.ticksByMutantId = new Map(
      mutantPlans.filter(isRunPlan).map(({ netTime, mutant, runOptions }) => {
        let ticks = netTime
        if (
          this.capabilities.reloadEnvironment === false &&
          runOptions.reloadEnvironment
        ) {
          ticks += this.timing.overhead
        }
        return [mutant.id, ticks] as const
      }),
    )
    this.progress.mutants = this.ticksByMutantId.size
    this.progress.total = [...this.ticksByMutantId.values()].reduce(
      (acc, n) => acc + n,
      0,
    )
  }

  protected handleMutantTested(result: MutantResult): number {
    const ticks = this.ticksByMutantId.get(result.id)
    if (ticks !== undefined) {
      this.progress.tested += 1
      this.progress.ticks += ticks
      if (result.status === 'Survived') {
        this.progress.survived += 1
      }
      if (result.status === 'Timeout') {
        this.progress.timedOut += 1
      }
    }
    return ticks ?? 0
  }

  protected getElapsedTime(): string {
    return formatTime(this.timer.elapsedSeconds())
  }

  protected getEtc(): string {
    const totalSecondsLeft = Math.floor(
      (this.timer.elapsedSeconds() / this.progress.ticks) *
        (this.progress.total - this.progress.ticks),
    )
    if (Number.isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
      return formatTime(totalSecondsLeft)
    } else {
      return 'n/a'
    }
  }
}

function formatTime(timeInSeconds: number): string {
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `~${minutes}m`
  }
  return '<1m'
}

function isRunPlan(mutantPlan: MutantTestPlan): mutantPlan is MutantRunPlan {
  return mutantPlan.plan === PlanKind.Run
}
