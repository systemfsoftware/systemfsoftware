import { expect } from 'vitest'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import { Array as Arr, Effect, Equal, HashMap, HashSet, Option } from 'effect'

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
        return Effect.succeed(Arr.map(mutants, (mutant) => [mutant.id] as const))
      }
      return Effect.succeed(groups)
    },
    check: (_checkerName, mutants) =>
      Effect.sync(() => {
        const ids = Arr.map(mutants, (mutant) => mutant.id)
        checkIdSets.push(ids)
        return Object.fromEntries(
          Arr.map(ids, (id) => [id, resultsById[id] ?? { status: 'passed' }] as const),
        )
      }),
  }
  return { checker, checkIdSets, plans: Arr.map(planIds, planOf) }
}

const batchSet = (groups: Iterable<Iterable<string>>) =>
  HashSet.fromIterable(Arr.map(Arr.fromIterable(groups), HashSet.fromIterable))

Feature('Isolating typechecks to one mutant group').body(({ scenario }) => {
  scenario(
    'Two unrelated batches are typechecked separately',
    Gherkin.Do.pipe(
      Given('a checker that batches mutants a and b together and mutant c alone')(
        'fixture',
        () => Effect.sync(() => recordingChecker([['a', 'b'], ['c']], {}, ['a', 'b', 'c'])),
      ),
      When('the typecheck phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('each batch is typechecked on its own')((s: {
        fixture: Recording
        pairs: readonly (readonly [MutantRunPlan, CheckResult])[]
      }) => {
        expect(Equal.equals(batchSet(s.fixture.checkIdSets), batchSet([['a', 'b'], ['c']]))).toBe(true)
        expect(
          Equal.equals(
            HashSet.fromIterable(Arr.map(s.pairs, ([plan]) => plan.mutant.id)),
            HashSet.fromIterable(['a', 'b', 'c']),
          ),
        ).toBe(true)
      }),
    ),
  )

  scenario(
    'An empty run does not typecheck',
    Gherkin.Do.pipe(
      Given('no mutants remain')('fixture', () => Effect.sync(() => recordingChecker([]))),
      When('the typecheck phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('no typecheck runs')((s: { fixture: Recording }) => {
        expect(Equal.equals(batchSet(s.fixture.checkIdSets), batchSet([]))).toBe(true)
      }),
    ),
  )

  scenario(
    'A single all-mutant batch is typechecked once',
    Gherkin.Do.pipe(
      Given('a checker that puts mutants a, b and c in one batch')(
        'fixture',
        () => Effect.sync(() => recordingChecker([['a', 'b', 'c']], {}, ['a', 'b', 'c'])),
      ),
      When('the typecheck phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('that batch is typechecked once')((s: { fixture: Recording }) => {
        expect(Equal.equals(batchSet(s.fixture.checkIdSets), batchSet([['a', 'b', 'c']]))).toBe(true)
      }),
    ),
  )

  scenario(
    'A type-invalid mutant is still reported as a compile error',
    Gherkin.Do.pipe(
      Given('a checker that rejects mutant a and accepts mutant b')(
        'fixture',
        () =>
          Effect.sync(() =>
            recordingChecker([['a'], ['b']], { a: { status: 'compileError', reason: 'TS2322' } }, ['a', 'b'])
          ),
      ),
      When('the typecheck phase runs')(
        'pairs',
        (s: { fixture: Recording }) => checkGroupedPlans(s.fixture.checker, 'typescript', s.fixture.plans),
      ),
      Then('mutant a is a compile error and mutant b passed')((s: {
        pairs: readonly (readonly [MutantRunPlan, CheckResult])[]
      }) => {
        const byId = HashMap.fromIterable(Arr.map(s.pairs, ([plan, result]) => [plan.mutant.id, result] as const))
        expect(HashMap.get(byId, 'a')).toEqual(Option.some({ status: 'compileError', reason: 'TS2322' }))
        expect(HashMap.get(byId, 'b')).toEqual(Option.some({ status: 'passed' }))
      }),
    ),
  )
})
