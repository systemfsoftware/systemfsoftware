import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { VitestTestRunner } from '@systemfsoftware/stryker-js-vitest-runner'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { expectKilled, expectTimeout } from './__fixtures__/assertions.js'
import { createMutant, createMutantRunOptions } from './__fixtures__/factories.js'
import { runnerContext } from './__fixtures__/vitest-runner-harness.js'

const Feature = makeFeature({ it, layer })

Feature('Recovering from a mutant that loops forever')
  .body(({ scenario }) => {
    scenario(
      'the hit counter cuts off an infinitely looping mutant',
      Gherkin.Do.pipe(
        Given('a runner on the infinite-loop project')('runner', () => runnerContext('infinite-loop')),
        When('the runner is initialized and the looping mutant is run')('result', (s) =>
          Effect.promise(async () => {
            const sut: VitestTestRunner = s.runner.sut
            await sut.init()
            return sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '4' }),
                testFilter: ['infinite-loop.spec.js'],
                hitLimit: 10,
              }),
            )
          })),
        Then('the run times out with the hit limit reason')((s) => {
          expectTimeout(s.result)
          expect(s.result.reason).toContain('Hit limit reached')
        }),
      ),
    )

    scenario(
      'the hit counter state is reset between runs',
      Gherkin.Do.pipe(
        Given('a runner on the infinite-loop project')('runner', () => runnerContext('infinite-loop')),
        When('it is initialized and a static looping mutant is run first')(
          'firstRun',
          (s) =>
            Effect.promise(async () => {
              const sut: VitestTestRunner = s.runner.sut
              await sut.init()
              return sut.mutantRun(
                createMutantRunOptions({
                  activeMutant: createMutant({ id: '4' }),
                  testFilter: ['infinite-loop.spec.js'],
                  hitLimit: 10,
                  mutantActivation: 'static',
                }),
              )
            }),
        ),
        When('a second, normal mutant is run on the same runner')(
          'secondRun',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.mutantRun(
                createMutantRunOptions({
                  // 7 is a 'normal' mutant that should be killed
                  activeMutant: createMutant({ id: '7' }),
                  testFilter: ['infinite-loop.spec.js'],
                  hitLimit: 10,
                  mutantActivation: 'static',
                }),
              )
            ),
        ),
        Then('the first run timed out and the second killed the mutant')((s) => {
          expectTimeout(s.firstRun)
          expectKilled(s.secondRun)
        }),
      ),
    )
  })
