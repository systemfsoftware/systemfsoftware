import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer, Ref } from 'effect'
import { completedValueOf } from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it })

const counterMadeAfterAFinishedRun = (start: number): Promise<Ref.Ref<number>> =>
  Kernel.run(Effect.void).then(() => Ref.makeUnsafe(start))

Feature('Running one program after another in the same process')
  .live('each scenario drives the simulation kernel itself, and a kernel run cannot run inside a kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A counter set up between two runs still holds its value in the later run',
      Gherkin.Do.pipe(
        Given('a first run has finished and a counter holding 7 was set up after it')(
          'counter',
          () => Effect.promise(() => counterMadeAfterAFinishedRun(7)),
        ),
        When('a second run reads the counter')(
          'read',
          (s) => Effect.promise(() => Kernel.run(Ref.get(s.counter))),
        ),
        Then('the second run reads 7')((s) => {
          expect(completedValueOf(s.read)).toBe(7)
        }),
      ),
    )

    scenario(
      'Whether a run is inside a step is observable from inside it and after it',
      Gherkin.Do.pipe(
        Given('a program that asks whether it is inside a step after giving way once')(
          'program',
          () =>
            Effect.succeed(Effect.gen(function*() {
              yield* Effect.yieldNow
              return Kernel.isStepping()
            })),
        ),
        When('the program runs, and the question is asked again once it has finished')(
          'states',
          (s) =>
            Effect.gen(function*() {
              const inside = yield* Effect.promise(() => Kernel.run(s.program))
              return { inside, outside: Kernel.isStepping() }
            }),
        ),
        Then('the program saw itself inside a step')((s) => {
          expect(s.states.inside).toSatisfy(completedValueOf)
        }),
        And('after the run the kernel reports it is not inside a step')((s) => {
          expect(s.states.outside).toBe(false)
        }),
      ),
    )
  })
