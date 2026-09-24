import { expect } from '@effect/vitest'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer } from 'effect'
import { completedValueOf } from './__fixtures__/kernelFixtures.js'
import {
  finishingAfterGivingWay,
  handedToOwnRuntime,
  wakingAfterNinetySeconds,
} from './__fixtures__/nestedRuntimeFixtures.js'

const Feature = makeFeature({ it })

const handedWork: ReadonlyArray<
  { readonly work: string; readonly program: Effect.Effect<string>; readonly answer: string }
> = [
  { work: 'gives way once and then finishes', program: finishingAfterGivingWay, answer: 'finished' },
  { work: 'sleeps for ninety seconds and then wakes', program: wakingAfterNinetySeconds, answer: 'woke' },
]

Feature('Keeping work a program hands to a runtime of its own inside the run')
  .live('each scenario drives the simulation kernel itself, and a kernel run cannot run inside a kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'Work that <work> on a runtime the program started itself completes inside the run',
      handedWork,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a program that hands work which ${row.work} to a runtime it starts itself`)(
            'program',
            () => Effect.succeed(handedToOwnRuntime(row.program)),
          ),
          When('the program runs')('run', (s) => Effect.promise(() => Kernel.run(s.program))),
          Then(`the run completes with the answer "${row.answer}"`)((s) => {
            expect(completedValueOf(s.run)).toBe(row.answer)
          }),
        ),
    )
    scenario(
      'A runtime started after a run has finished works on the host again',
      Gherkin.Do.pipe(
        Given('a run has finished')('finished', () => Effect.promise(() => Kernel.run(Effect.void))),
        When('a program outside any run gives way once on a runtime of its own')(
          'answer',
          () => Effect.promise(() => Effect.runPromise(finishingAfterGivingWay)),
        ),
        Then('the program finishes')((s) => {
          expect(s.answer).toBe('finished')
        }),
      ),
    )
  })
