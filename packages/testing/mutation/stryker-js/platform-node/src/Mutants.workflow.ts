import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const HIT_LIMIT_FACTOR = 100

const PlannerOptionsSchema = S.Struct({
  disableBail: S.Boolean,
  timeoutMS: S.Finite,
  timeoutFactor: S.Finite,
  ignoreStatic: S.Boolean,
})

export class PlanMutantTestsCommand extends S.TaggedClass<PlanMutantTestsCommand>()('PlanMutantTestsCommand', {
  mutants: S.Array(Mutant),
  timeOverheadMS: S.Finite,
  timeSpentAllTests: S.Finite,
  globalTestFilter: S.optional(S.Array(S.String)),
  hitsByMutantId: S.Record(S.String, S.Finite),
  staticCoverage: S.optional(S.Record(S.String, S.Finite)),
  testsByMutantId: S.Record(S.String, S.Array(S.String)),
  testTimeById: S.Record(S.String, S.Finite),
  options: PlannerOptionsSchema,
  /**
   * Where each mutated file lives inside the sandbox, gathered by the caller.
   *
   * The sandbox directory is decided at run time, so the decision cannot compute this and
   * is handed it instead. Without it the planned run options carry no path and no caller
   * can execute them.
   */
  sandboxFileByName: S.Record(S.String, S.String),
}) {}

const DecidedRunOptionsSchema = S.Struct({
  mutantActivation: S.Literals(['runtime', 'static']),
  timeout: S.Finite,
  sandboxFileName: S.String,
  disableBail: S.Boolean,
  reloadEnvironment: S.Boolean,
  testFilter: S.optionalKey(S.Array(S.String)),
  hitLimit: S.optionalKey(S.Finite),
})

const RunPlanSchema = S.Struct({
  plan: S.Literal('Run'),
  mutantId: S.String,
  netTime: S.Finite,
  runOptions: DecidedRunOptionsSchema,
  static: S.optional(S.Boolean),
  coveredBy: S.optional(S.Array(S.String)),
})

const EarlyResultPlanSchema = S.Struct({
  plan: S.Literal('EarlyResult'),
  mutantId: S.String,
  status: S.Literals([
    'Killed',
    'Survived',
    'NoCoverage',
    'Timeout',
    'CompileError',
    'RuntimeError',
    'Ignored',
    'Pending',
  ]),
  statusReason: S.optional(S.String),
  static: S.optional(S.Boolean),
  coveredBy: S.optional(S.Array(S.String)),
})

const TestPlanSchema = S.Union([EarlyResultPlanSchema, RunPlanSchema])

export class PlannedMutantTests extends S.TaggedClass<PlannedMutantTests>()('PlannedMutantTests', {
  plans: S.Array(TestPlanSchema),
  totalNetTime: S.Finite,
}) {}

export class PlanMutantTestsError extends S.TaggedError<PlanMutantTestsError>()('PlanMutantTestsError', {
  message: S.String,
  detail: S.String,
}) {}

const hasCoverage = (staticCoverage: Record<string, number> | undefined): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  return Object.keys(staticCoverage).length > 0
}

const hasStaticCoverage = (staticCoverage: Record<string, number> | undefined, mutantId: string): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  const count = staticCoverage[mutantId]
  if (count === undefined) {
    return false
  }
  return count > 0
}

const calculateTotalTimeForIds = (testIds: readonly string[], testTimeById: Record<string, number>): number =>
  testIds.reduce((acc, id) => {
    const t = testTimeById[id]
    if (t !== undefined) {
      return acc + t
    }
    return acc
  }, 0)

const getHitLimit = (hitCount: number | undefined): number | undefined => {
  if (hitCount === undefined) {
    return undefined
  }
  return hitCount * HIT_LIMIT_FACTOR
}

const getMutantActivation = (testFilter: readonly string[] | undefined): 'runtime' | 'static' => {
  if (testFilter !== undefined) {
    return 'runtime'
  }
  return 'static'
}

const getCoveredBy = (mutant: Mutant): string[] | undefined => {
  if (mutant.coveredBy === undefined) {
    return undefined
  }
  return [...mutant.coveredBy]
}

const getTestFilter = (globalFilter: readonly string[] | undefined): string[] | undefined => {
  if (globalFilter === undefined) {
    return undefined
  }
  return [...globalFilter]
}

const toRunPlan = (
  mutant: Mutant,
  command: PlanMutantTestsCommand,
  netTime: number,
  testFilter: readonly string[] | undefined,
  isStatic: boolean | undefined,
  coveredBy: readonly string[] | undefined,
): S.Schema.Type<typeof RunPlanSchema> => {
  const disableBail = command.options.disableBail
  const timeoutMS = command.options.timeoutMS
  const timeoutFactor = command.options.timeoutFactor
  const timeout = timeoutFactor * netTime + timeoutMS + command.timeOverheadMS
  const hitCount = command.hitsByMutantId[mutant.id]
  const hitLimit = getHitLimit(hitCount)
  const canHotSwap = testFilter !== undefined && isStatic === false
  const mutantActivation = getMutantActivation(testFilter)
  const reloadEnvironment = !canHotSwap
  return {
    plan: 'Run',
    mutantId: mutant.id,
    netTime,
    runOptions: {
      mutantActivation,
      timeout,
      sandboxFileName: command.sandboxFileByName[mutant.fileName] ?? mutant.fileName,
      disableBail,
      reloadEnvironment,
      ...(testFilter !== undefined && { testFilter: [...testFilter] }),
      ...(hitLimit !== undefined && { hitLimit }),
    },
    ...(isStatic !== undefined && { static: isStatic }),
    ...(coveredBy !== undefined && { coveredBy: [...coveredBy] }),
  }
}

const toEarlyResultPlan = (
  mutant: Mutant,
  isStatic: boolean | undefined,
  status: MutantStatus,
  statusReason: string | undefined,
  coveredBy: readonly string[] | undefined,
): S.Schema.Type<typeof EarlyResultPlanSchema> => ({
  plan: 'EarlyResult',
  mutantId: mutant.id,
  status,
  ...(statusReason !== undefined && { statusReason }),
  ...(statusReason === undefined && mutant.statusReason !== undefined && { statusReason: mutant.statusReason }),
  ...(isStatic !== undefined && { static: isStatic }),
  ...(coveredBy !== undefined && { coveredBy: [...coveredBy] }),
})

const decidePlanForMutant = (
  mutant: Mutant,
  command: PlanMutantTestsCommand,
): S.Schema.Type<typeof TestPlanSchema> => {
  const isStatic = hasStaticCoverage(command.staticCoverage, mutant.id)
  if (mutant.status !== undefined) {
    const coveredBy = getCoveredBy(mutant)
    return toEarlyResultPlan(mutant, isStatic, mutant.status, mutant.statusReason, coveredBy)
  }
  if (hasCoverage(command.staticCoverage)) {
    const tests = command.testsByMutantId[mutant.id] ?? []
    const coveredBy = [...tests]
    const ignoreStatic = command.options.ignoreStatic
    const shouldUseCovered = !isStatic || (ignoreStatic && coveredBy.length > 0)
    if (shouldUseCovered) {
      const netTime = calculateTotalTimeForIds(tests, command.testTimeById)
      return toRunPlan(mutant, command, netTime, coveredBy, isStatic, coveredBy)
    }
    if (ignoreStatic) {
      return toEarlyResultPlan(mutant, isStatic, 'Ignored', 'Static mutant (and "ignoreStatic" was enabled)', coveredBy)
    }
    const testFilter = getTestFilter(command.globalTestFilter)
    return toRunPlan(mutant, command, command.timeSpentAllTests, testFilter, isStatic, coveredBy)
  }

  const testFilter = getTestFilter(command.globalTestFilter)
  return toRunPlan(mutant, command, command.timeSpentAllTests, testFilter, undefined, undefined)
}

const decidePlanMutantTests = (
  command: PlanMutantTestsCommand,
): Result.Result<PlannedMutantTests, PlanMutantTestsError> => {
  const plans = command.mutants.map((mutant) => decidePlanForMutant(mutant, command))
  const totalNetTime = plans.reduce((acc, plan) => {
    if (plan.plan === 'Run') {
      return acc + plan.netTime
    }
    return acc
  }, 0)
  return Result.succeed(
    PlannedMutantTests.make({
      plans,
      totalNetTime,
    }),
  )
}

export const planMutantTests = Workflow.make(
  PlanMutantTestsCommand,
  (command: PlanMutantTestsCommand): Result.Result<PlannedMutantTests, PlanMutantTestsError> =>
    decidePlanMutantTests(command),
)
