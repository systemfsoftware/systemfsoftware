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

export type ProgressTally = {
  readonly survived: number
  readonly timedOut: number
  readonly tested: number
  readonly mutants: number
  readonly total: number
  readonly ticks: number
  readonly ticksByMutantId: ReadonlyMap<string, number>
  readonly timing: RunTiming
  readonly capabilities: TestRunnerCapabilities
  readonly startedAt: number
}

export const emptyTally = (startedAt: number): ProgressTally => ({
  survived: 0,
  timedOut: 0,
  tested: 0,
  mutants: 0,
  total: 0,
  ticks: 0,
  ticksByMutantId: new Map<string, number>(),
  timing: { net: 0, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  startedAt,
})

export const handleDryRunCompleted = (
  tally: ProgressTally,
  event: DryRunCompletedEvent,
): ProgressTally => ({
  ...tally,
  timing: event.timing,
  capabilities: event.capabilities,
})

export const handleMutationTestingPlanReady = (
  tally: ProgressTally,
  event: MutationTestingPlanReadyEvent,
  startedAt: number,
): ProgressTally => {
  const map = new Map<string, number>()
  for (const plan of event.mutantPlans) {
    if (!isRunPlan(plan)) continue
    let ticks = plan.netTime
    if (
      tally.capabilities.reloadEnvironment === false &&
      plan.runOptions.reloadEnvironment
    ) {
      ticks += tally.timing.overhead
    }
    map.set(plan.mutant.id, ticks)
  }
  const total = [...map.values()].reduce((acc, n) => acc + n, 0)
  return {
    ...tally,
    startedAt,
    ticksByMutantId: map,
    mutants: map.size,
    total,
  }
}

export const handleMutantTested = (
  tally: ProgressTally,
  result: MutantResult,
): { readonly tally: ProgressTally; readonly ticks: number } => {
  const ticks = tally.ticksByMutantId.get(result.id)
  if (ticks === undefined) {
    return { tally, ticks: 0 }
  }
  const next: ProgressTally = {
    ...tally,
    tested: tally.tested + 1,
    ticks: tally.ticks + ticks,
    survived: result.status === 'Survived' ? tally.survived + 1 : tally.survived,
    timedOut: result.status === 'Timeout' ? tally.timedOut + 1 : tally.timedOut,
  }
  return { tally: next, ticks }
}

export const getElapsedTime = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  return formatTime(elapsed)
}

export const getEtc = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  const totalSecondsLeft = Math.floor(
    (elapsed / tally.ticks) * (tally.total - tally.ticks),
  )
  if (Number.isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
    return formatTime(totalSecondsLeft)
  }
  return 'n/a'
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
