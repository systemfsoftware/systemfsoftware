import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant, RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import { Array as Arr, Equal, HashMap, HashSet, Option } from 'effect'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import { FastCheck as fc } from 'effect/testing'

import { type CheckerResourceService, checkGroupedPlans } from '../run/Checker.js'

const CHECKER_NAME = 'typescript'

const COMPILE_ERROR: CheckResult = { status: 'compileError', reason: 'TS2322' }

const PASSED: CheckResult = { status: 'passed' }

const LOCATION = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }

const planOf = (id: string): MutantRunPlan => {
  const mutant: Mutant = {
    _tag: 'Mutant',
    id,
    fileName: 'src/f.ts',
    mutatorName: 'arithmetic',
    replacement: '0',
    location: LOCATION,
  }
  return {
    plan: 'Run',
    mutant,
    netTime: 0,
    runOptions: {
      timeout: 1,
      disableBail: false,
      activeMutant: mutant,
      sandboxFileName: mutant.fileName,
      mutantActivation: 'runtime',
      reloadEnvironment: true,
    },
  }
}

interface BatchCase {
  readonly ids: readonly string[]
  readonly groups: readonly (readonly string[])[]
  readonly answers: Readonly<Record<string, CheckResult>>
}

const answerFor = (rejected: boolean | undefined): CheckResult =>
  Match.value(rejected).pipe(
    Match.when(true, () => COMPILE_ERROR),
    Match.orElse(() => PASSED),
  )

const groupsOf = (ids: readonly string[], assignment: readonly number[]): readonly (readonly string[])[] => {
  const buckets = ids.reduce<Record<number, string[]>>((acc, id, index) => {
    const key = assignment[index] ?? 0
    return { ...acc, [key]: [...(acc[key] ?? []), id] }
  }, {})
  return Object.values(buckets)
}

const batchCase = (
  ids: readonly string[],
  assignment: readonly number[],
  rejected: readonly boolean[],
): BatchCase => ({
  ids,
  groups: groupsOf(ids, assignment),
  answers: Object.fromEntries(Arr.map(ids, (id, index) => [id, answerFor(rejected[index])] as const)),
})

const recordingChecker = (batch: BatchCase): {
  readonly checker: CheckerResourceService
  readonly checkIdSets: string[][]
} => {
  const checkIdSets: string[][] = []
  const checker: CheckerResourceService = {
    group: (_checkerName, mutants) => {
      if (batch.groups.length === 0) {
        return Effect.succeed(Arr.map(mutants, (mutant) => [mutant.id] as const))
      }
      return Effect.succeed(batch.groups)
    },
    check: (_checkerName, mutants) =>
      Effect.sync(() => {
        const ids = Arr.map(mutants, (mutant) => mutant.id)
        checkIdSets.push(ids)
        return Object.fromEntries(Arr.map(ids, (id) => [id, batch.answers[id] ?? PASSED] as const))
      }),
  }
  return { checker, checkIdSets }
}

const batchSet = (groups: Iterable<Iterable<string>>) =>
  HashSet.fromIterable(Arr.map(Arr.fromIterable(groups), HashSet.fromIterable))

const answeredBy = (pairs: readonly (readonly [MutantRunPlan, CheckResult])[]) =>
  HashMap.fromIterable(Arr.map(pairs, ([plan, result]) => [plan.mutant.id, result] as const))

const ID_ARB = fc.uniqueArray(fc.stringMatching(/^m[0-9]{1,2}$/), { minLength: 0, maxLength: 6 })

const ASSIGNMENT_ARB = (size: number) =>
  fc.tuple(...Arr.map(Array.from({ length: size }), () => fc.nat({ max: Math.max(size - 1, 0) })))

const REJECTED_ARB = (size: number) => fc.tuple(...Arr.map(Array.from({ length: size }), () => fc.boolean()))

const BATCH_CASE_ARB: fc.Arbitrary<BatchCase> = ID_ARB.chain((ids) =>
  fc.tuple(ASSIGNMENT_ARB(ids.length), REJECTED_ARB(ids.length)).map(([assignment, rejected]) =>
    batchCase(ids, assignment, rejected)
  )
)

const runBatches = (batch: BatchCase) => {
  const recording = recordingChecker(batch)
  const pairs = Effect.runSync(checkGroupedPlans(recording.checker, CHECKER_NAME, Arr.map(batch.ids, planOf)))
  return { ...recording, pairs }
}

describe('checkGroupedPlans', () => {
  it.prop('∀c_Batches_≡EveryBatchIsCheckedOnItsOwn', [BATCH_CASE_ARB], ([batch]) => {
    const { checkIdSets } = runBatches(batch)
    return Equal.equals(batchSet(checkIdSets), batchSet(batch.groups))
  })

  it.prop('∀c_Batches_≡EveryPlanGetsTheCheckerAnswerForItsId', [BATCH_CASE_ARB], ([batch]) => {
    const { pairs } = runBatches(batch)
    return pairs.length === batch.ids.length &&
      Equal.equals(answeredBy(pairs), HashMap.fromIterable(Object.entries(batch.answers)))
  })

  it.prop(
    '∀c_NoMutants_≡NoTypecheckRuns',
    [fc.constant(batchCase([], [], []))],
    ([batch]) => {
      const { checkIdSets, pairs } = runBatches(batch)
      return Equal.equals(batchSet(checkIdSets), batchSet([])) && pairs.length === 0
    },
  )

  it.prop(
    '∀c_OneBatch_≡CheckedOnce',
    [fc.constant(batchCase(['a', 'b', 'c'], [0, 0, 0], [false, false, false]))],
    ([batch]) => {
      const { checkIdSets, pairs } = runBatches(batch)
      return Equal.equals(batchSet(checkIdSets), batchSet([['a', 'b', 'c']])) && checkIdSets.length === 1 &&
        pairs.length === 3
    },
  )

  it.prop(
    '∀c_RejectedMutant_≡CompileErrorBesideTheAcceptedOne',
    [fc.constant(batchCase(['a', 'b'], [0, 1], [true, false]))],
    ([batch]) => {
      const byId = answeredBy(runBatches(batch).pairs)
      return Equal.equals(HashMap.get(byId, 'a'), Option.some(COMPILE_ERROR)) &&
        Equal.equals(HashMap.get(byId, 'b'), Option.some(PASSED))
    },
  )
})
