import { expect } from 'vitest'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import { Effect } from 'effect'

import { type CheckerResourceService, checkGroupedPlans } from '@systemfsoftware/stryker-js-platform-node'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }

type Recording = {
  readonly checker: CheckerResourceService
  readonly checkIdSets: string[][]
  readonly plans: readonly MutantRunPlan[]
}

const planOf = (id: string): MutantRunPlan => {
  const mutant = new Mutant({
    id,
    fileName: 'src/f.ts',
    mutatorName: 'arithmetic',
    replacement: '0',
    location: LOCATION,
  })
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

const recordingChecker = (
  groups: readonly (readonly string[])[],
  resultsById: Readonly<Record<string, CheckResult>> = {},
  planIds: readonly string[] = [],
): Recording => {
  const checkIdSets: string[][] = []
  const checker: CheckerResourceService = {
    group: (_checkerName, mutants) => {
      if (groups.length === 0) {
        return Effect.succeed(mutants.map((mutant) => [mutant.id] as const))
      }
      return Effect.succeed(groups)
    },
    check: (_checkerName, mutants) =>
      Effect.sync(() => {
        const ids = mutants.map((mutant) => mutant.id)
        checkIdSets.push(ids)
        const answers: Record<string, CheckResult> = {}
        for (const id of ids) {
          answers[id] = resultsById[id] ?? { status: 'passed' }
        }
        return answers
      }),
  }
  return { checker, checkIdSets, plans: planIds.map(planOf) }
}

const idSetsEqual = (actual: readonly string[], expected: readonly string[]): boolean => {
  if (actual.length !== expected.length) {
    return false
  }
  const wanted: Record<string, true> = {}
  for (const id of expected) {
    wanted[id] = true
  }
  return actual.every((id) => wanted[id] === true)
}

Feature('Checking mutants in checker-defined groups').body(({ scenario }) => {
  scenario(
    'Should_CheckEachGroupOnce_When_GroupReturnsTwoDisjointGroups',
    Gherkin.Do.pipe(
      Given('plans a, b, c and a checker that groups [a,b] and [c]')(
        'fixture',
        () => Effect.sync(() => recordingChecker([['a', 'b'], ['c']], {}, ['a', 'b', 'c'])),
      ),
      When('the grouped checker phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('check ran twice, once per group, never on the full set')((s: {
        fixture: Recording
        pairs: readonly (readonly [MutantRunPlan, CheckResult])[]
      }) => {
        expect(s.fixture.checkIdSets).toHaveLength(2)
        expect(s.fixture.checkIdSets.some((ids) => idSetsEqual(ids, ['a', 'b']))).toBe(true)
        expect(s.fixture.checkIdSets.some((ids) => idSetsEqual(ids, ['c']))).toBe(true)
        expect(s.fixture.checkIdSets.some((ids) => idSetsEqual(ids, ['a', 'b', 'c']))).toBe(false)
        expect(s.pairs.map(([plan]) => plan.mutant.id).sort()).toEqual(['a', 'b', 'c'])
      }),
    ),
  )

  scenario(
    'Should_NotCallCheck_When_ThereAreNoPlans',
    Gherkin.Do.pipe(
      Given('an empty plan list')('fixture', () => Effect.sync(() => recordingChecker([]))),
      When('the grouped checker phase runs on no plans')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('check is not called')((s: { fixture: Recording }) => {
        expect(s.fixture.checkIdSets).toHaveLength(0)
      }),
    ),
  )

  scenario(
    'Should_CheckOnce_When_GroupReturnsOneAllMutantGroup',
    Gherkin.Do.pipe(
      Given('plans a, b, c in a single group')(
        'fixture',
        () => Effect.sync(() => recordingChecker([['a', 'b', 'c']], {}, ['a', 'b', 'c'])),
      ),
      When('the grouped checker phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('check ran once with the full set')((s: { fixture: Recording }) => {
        expect(s.fixture.checkIdSets).toHaveLength(1)
        expect(idSetsEqual(s.fixture.checkIdSets[0] ?? [], ['a', 'b', 'c'])).toBe(true)
      }),
    ),
  )

  scenario(
    'Should_KeepCompileErrorPairs_When_OneGroupFailsCheck',
    Gherkin.Do.pipe(
      Given('group [a] compile-errors and group [b] passes')(
        'fixture',
        () =>
          Effect.sync(() =>
            recordingChecker([['a'], ['b']], { a: { status: 'compileError', reason: 'TS2322' } }, ['a', 'b'])
          ),
      ),
      When('the grouped checker phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('a is compileError and b is passed')((s: {
        pairs: readonly (readonly [MutantRunPlan, CheckResult])[]
      }) => {
        const byId: Record<string, CheckResult> = {}
        for (const [plan, result] of s.pairs) {
          byId[plan.mutant.id] = result
        }
        expect(byId['a']).toEqual({ status: 'compileError', reason: 'TS2322' })
        expect(byId['b']).toEqual({ status: 'passed' })
      }),
    ),
  )
})
