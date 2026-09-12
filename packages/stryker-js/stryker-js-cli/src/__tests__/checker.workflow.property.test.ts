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

const IDS_ARB = (minLength: number) => fc.uniqueArray(fc.stringMatching(/^m[0-9]{1,2}$/), { minLength, maxLength: 6 })

const BATCH_CASE_ARB: fc.Arbitrary<BatchCase> = ID_ARB.chain((ids) =>
  fc.tuple(ASSIGNMENT_ARB(ids.length), REJECTED_ARB(ids.length)).map(([assignment, rejected]) =>
    batchCase(ids, assignment, rejected)
  )
)

const SINGLE_GROUP_ARB: fc.Arbitrary<BatchCase> = IDS_ARB(1).chain((ids) =>
  fc.constant(batchCase(ids, Arr.map(ids, () => 0), Arr.map(ids, () => false)))
)

const ONE_REJECTED_ARB: fc.Arbitrary<{ readonly batch: BatchCase; readonly rejectedId: string }> = fc.tuple(
  IDS_ARB(1),
  fc.stringMatching(/^r[0-9]{1,2}$/),
  fc.nat({ max: 5 }),
).map(([ids, rejectedId, k]) => {
  const position = k % (ids.length + 1)
  const all = [...ids.slice(0, position), rejectedId, ...ids.slice(position)]
  return {
    batch: batchCase(all, Arr.map(all, () => 0), Arr.map(all, (id) => id === rejectedId)),
    rejectedId,
  }
})

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
    '∀b_SingleGroupBatches_≡TheWholeBatchIsCheckedOnce',
    [SINGLE_GROUP_ARB],
    ([batch]) => {
      const { checkIdSets, pairs } = runBatches(batch)
      return checkIdSets.length === 1 && Equal.equals(batchSet(checkIdSets), batchSet([batch.ids])) &&
        pairs.length === batch.ids.length &&
        Arr.every(pairs, ([, result]) => Equal.equals(result, PASSED))
    },
  )

  it.prop(
    '∀b_BatchesWithOneRejectedMutant_≡OnlyTheRejectedMutantSeesTheCompileError',
    [ONE_REJECTED_ARB],
    ([{ batch, rejectedId }]) => {
      const byId = answeredBy(runBatches(batch).pairs)
      return Equal.equals(HashMap.get(byId, rejectedId), Option.some(COMPILE_ERROR)) &&
        Arr.every(
          Arr.filter(batch.ids, (id) => id !== rejectedId),
          (id) => Equal.equals(HashMap.get(byId, id), Option.some(PASSED)),
        )
    },
  )
})
