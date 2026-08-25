import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { MutantRunPlan } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'

import { pairCheckResults, pairGroups } from './checker-contract.js'
import type { CheckerContractBroken } from './checker-contract.schema.js'
import type { CheckerCrash, CheckerResourceService } from './checker-resource.js'

/**
 * Ask a checker about run plans and get run plans back.
 *
 * The port speaks `Mutant` because that is all a checker needs; the engine
 * schedules `MutantRunPlan`. This is the two-line shell around that translation:
 * project the plans down, call the checker, and hand the answers to the pure decision
 * that joins them back. The join is where the work is, and it is pure.
 */
export const checkPlans = (
  checker: CheckerResourceService,
  checkerName: string,
  plans: readonly MutantRunPlan[],
): Effect.Effect<
  readonly (readonly [MutantRunPlan, CheckResult])[],
  CheckerCrash | CheckerContractBroken
> =>
  checker.check(checkerName, plans.map((plan) => plan.mutant)).pipe(
    Effect.flatMap((answers) => Effect.fromResult(pairCheckResults(checkerName, plans, answers))),
  )

/**
 * Ask a checker how to group run plans, and get groups of run plans back.
 */
export const groupPlans = (
  checker: CheckerResourceService,
  checkerName: string,
  plans: readonly MutantRunPlan[],
): Effect.Effect<
  readonly (readonly MutantRunPlan[])[],
  CheckerCrash | CheckerContractBroken
> =>
  checker.group(checkerName, plans.map((plan) => plan.mutant)).pipe(
    Effect.flatMap((idGroups) => Effect.fromResult(pairGroups(checkerName, plans, idGroups))),
  )
