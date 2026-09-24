import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { ConfigProvider, Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { fiberPatternOf } from './__fixtures__/kernelFixtures.js'
import {
  budgetLimitOf,
  checkThenSet,
  firstFailureValue,
  isOverBudget,
  nightlySeeds,
  outcomeBound,
  perChangeSeeds,
  queueProgram,
  raceDetected,
  replayValueOf,
  scopedProgram,
  seededTwice,
  threeDeviationPath,
} from './__fixtures__/searchFixtures.js'

const Feature = makeFeature({ it, layer })

const nightlyCount = Math.ceil(Math.log(0.01) / Math.log(1 - 1 / (3 * 400 ** 2)))

Feature('Exploring schedules to catch concurrency faults')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A queue the kernel cannot watch turns pruning off, and the result says so',
      Gherkin.Do.pipe(
        Given('a target whose shared state includes a queue the kernel does not watch')(
          'outcome',
          () => Effect.promise(() => Kernel.search(queueProgram, { preemptions: 1 })),
        ),
        Then('the search finishes within its stated bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(false)
        }),
        Then('the explored bound reports pruning was off and names the queue')((s) => {
          const bound = outcomeBound(s.outcome)
          expect(bound.pruning.enabled).toBe(false)
          expect(bound.pruning.disabledBy).toContain('Queue')
        }),
      ),
    )

    scenario(
      'Two workers racing for an empty slot are caught at one preemption, pruned and unpruned',
      Gherkin.Do.pipe(
        Given('two workers that each take an empty slot only while it is still empty')(
          'searches',
          () =>
            Effect.promise(() =>
              Kernel.search(checkThenSet, { preemptions: 1, isFailure: raceDetected }).then((watched) =>
                Kernel.search(checkThenSet, {
                  preemptions: 1,
                  prune: false,
                  isFailure: raceDetected,
                }).then((unwatched) => ({ watched, unwatched }))
              )
            ),
        ),
        Then('each search finds a run where both workers believed they took the slot')((s) => {
          expect(firstFailureValue(s.searches.watched)).toEqual([true, true])
          expect(firstFailureValue(s.searches.unwatched)).toEqual([true, true])
        }),
        Then('each failing schedule spends its one preemption')((s) => {
          expect(s.searches.watched.failures[0]?.preemptions).toBe(1)
          expect(s.searches.unwatched.failures[0]?.preemptions).toBe(1)
        }),
      ),
    )

    scenario(
      'A failing schedule padded with stray detours shrinks back to the detour that matters',
      Gherkin.Do.pipe(
        Given(
          'a randomly steered schedule that loses the race after three detours, two of which the race does not need',
        )(
          'path',
          () => Effect.promise(() => threeDeviationPath()),
        ),
        When('the failing schedule is shrunk')(
          'shrunk',
          (s) => Effect.promise(() => Kernel.shrink(checkThenSet, { path: s.path, isFailure: raceDetected })),
        ),
        Then('only the detour that decides the race is left')((s) => {
          expect(s.shrunk.deviations).toBe(1)
        }),
        Then('the shrunk schedule still fails on replay')((s) => {
          expect(replayValueOf(s.shrunk)).toEqual([true, true])
        }),
      ),
    )

    scenario(
      'The same seed steers two runs down the same schedule',
      Gherkin.Do.pipe(
        Given('two runs steered by one seed')('runs', () => Effect.promise(() => seededTwice(7))),
        Then('both runs take the same decisions in the same order')((s) => {
          expect(s.runs.first.decisions).toEqual(s.runs.second.decisions)
        }),
        Then('both runs hand control to the same workers at the same moments')((s) => {
          expect(fiberPatternOf(s.runs.first.steps)).toEqual(fiberPatternOf(s.runs.second.steps))
        }),
      ),
    )

    scenario(
      'The nightly profile budgets the derived run count while per-change keeps two hundred and fifty',
      Gherkin.Do.pipe(
        Given('a scenario measured at three fibers and four hundred steps')(
          'counts',
          () => Effect.sync(() => ({ nightly: nightlySeeds(), perChange: perChangeSeeds() })),
        ),
        Then('the nightly budget is the derived count')((s) => {
          expect(s.counts.nightly).toBe(nightlyCount)
        }),
        Then('the per-change budget stays at two hundred and fifty')((s) => {
          expect(s.counts.perChange).toBe(250)
        }),
      ),
    )

    scenario(
      'Naming the nightly profile in the environment selects the derived budget',
      Gherkin.Do.pipe(
        Given('the environment names the nightly profile')(
          'budget',
          () =>
            Effect.promise(() =>
              Effect.runPromise(
                Effect.provideService(
                  Kernel.currentSeedsFor({ fibers: 3, steps: 400 }),
                  ConfigProvider.ConfigProvider,
                  ConfigProvider.fromEnvRecord({ CONFORMANCE_PROFILE: 'nightly' }),
                ),
              )
            ),
        ),
        Then('the budget is the derived count rather than the per-change count')((s) => {
          expect(s.budget).toBe(nightlyCount)
          expect(s.budget).not.toBe(250)
        }),
      ),
    )

    scenario(
      'A search out of schedules fails over and names the schedule budget',
      Gherkin.Do.pipe(
        Given('a search allowed a single schedule before the race can appear')(
          'outcome',
          () =>
            Effect.promise(() =>
              Kernel.search(checkThenSet, { preemptions: 2, maxSchedules: 1, isFailure: raceDetected })
            ),
        ),
        Then('the search reports it ran out before covering its bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(true)
        }),
        Then('the named limit is the schedule budget')((s) => {
          expect(budgetLimitOf(s.outcome)).toBe('schedule budget')
        }),
      ),
    )

    scenario(
      'A search out of time fails over and names the wall-clock bound',
      Gherkin.Do.pipe(
        Given('a search whose clock already passed its time budget')(
          'outcome',
          () => {
            const ticking = (() => {
              let at = 0
              return () => {
                at += 10
                return at
              }
            })()
            return Effect.promise(() =>
              Kernel.search(checkThenSet, {
                preemptions: 2,
                timeoutMs: 1,
                now: ticking,
                isFailure: raceDetected,
              })
            )
          },
        ),
        Then('the search reports it ran out before covering its bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(true)
        }),
        Then('the named limit is the wall-clock bound')((s) => {
          expect(budgetLimitOf(s.outcome)).toBe('wall-clock bound')
        }),
      ),
    )

    scenario(
      'A resource cleaned up through a scope turns pruning off, and the result names it',
      Gherkin.Do.pipe(
        Given('a target that acquires and releases a resource within a scope')(
          'outcome',
          () => Effect.promise(() => Kernel.search(scopedProgram, { preemptions: 1 })),
        ),
        Then('the explored bound reports pruning was off and names the resource cleanup')((s) => {
          const bound = outcomeBound(s.outcome)
          expect(bound.pruning.enabled).toBe(false)
          expect(bound.pruning.disabledBy).toContain('Scope finalizer')
        }),
      ),
    )
  })
