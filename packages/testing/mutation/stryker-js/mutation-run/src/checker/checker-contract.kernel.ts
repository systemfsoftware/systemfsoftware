import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { MutantRunPlan } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Result from 'effect/Result'

import {
  CheckerAnsweredUnrequested,
  type CheckerContractBroken,
  CheckerSkippedRequested,
} from './checker-contract.schema.js'

/**
 * Pair a checker's answers back to the run plans they were asked about.
 *
 * A checker's port speaks `Mutant`; the engine schedules `MutantRunPlan`. Going
 * one way is a projection, but coming back is a join that can fail two ways —
 * the checker answered about something it was not asked about, or it did not
 * answer about something it was. Both are the plugin breaking its contract, and
 * each carries its own tag, so a caller matches on the failure rather than
 * parsing ids out of a message.
 *
 * Pure: the pairing is a decision over two lists, so it runs without a checker,
 * a process or a clock — which is the point, because this is the part worth
 * testing.
 */
export const pairCheckResults = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  answers: Readonly<Record<string, CheckResult>>,
): Result.Result<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> => {
  const byId = new Map(plans.map((plan) => [plan.mutant.id, plan]))
  const paired: (readonly [MutantRunPlan, CheckResult])[] = []
  const unrequested: string[] = []

  for (const [id, answer] of Object.entries(answers)) {
    const plan = byId.get(id)
    if (plan === undefined) {
      unrequested.push(id)
      continue
    }
    paired.push([plan, answer])
  }

  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName,
        phase: 'check',
        unrequestedIds: unrequested,
        requestedIds: plans.map((plan) => plan.mutant.id),
      }),
    )
  }

  const answered = new Set(paired.map(([plan]) => plan.mutant.id))
  const missing = plans.map((plan) => plan.mutant.id).filter((id) => !answered.has(id))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({ checkerName, phase: 'check', missingIds: missing }),
    )
  }

  return Result.succeed(paired)
}

/**
 * Resolve a checker's id groups back to run plans.
 *
 * Same join as `pairCheckResults` and the same two failures, over groups rather
 * than single answers. A mutant absent from every group is as much a dropped
 * mutant as one absent from the check results — it would go on to be scheduled
 * as though the checker had approved it.
 */
export const pairGroups = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  idGroups: readonly (readonly string[])[],
): Result.Result<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> => {
  const byId = new Map(plans.map((plan) => [plan.mutant.id, plan]))
  const grouped = new Set<string>()
  const unrequested: string[] = []
  const groups: (readonly MutantRunPlan[])[] = []

  for (const idGroup of idGroups) {
    const group: MutantRunPlan[] = []
    for (const id of idGroup) {
      grouped.add(id)
      const plan = byId.get(id)
      if (plan === undefined) {
        unrequested.push(id)
        continue
      }
      group.push(plan)
    }
    groups.push(group)
  }

  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName,
        phase: 'group',
        unrequestedIds: unrequested,
        requestedIds: plans.map((plan) => plan.mutant.id),
      }),
    )
  }

  const missing = plans.map((plan) => plan.mutant.id).filter((id) => !grouped.has(id))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({ checkerName, phase: 'group', missingIds: missing }),
    )
  }

  return Result.succeed(groups)
}
