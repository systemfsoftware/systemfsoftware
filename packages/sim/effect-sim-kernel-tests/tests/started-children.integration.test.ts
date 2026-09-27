import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer, Schema } from 'effect'
import { completedRunOf, completedValueOf } from './__fixtures__/kernelFixtures.js'
import {
  briefWork,
  CHILD_NAMES,
  childrenStartedStraightAway,
  longWork,
  rootLeavingDetachedChild,
  rootWithScopedChild,
} from './__fixtures__/startedChildrenFixtures.js'

const Feature = makeFeature({ it })

const childWork: ReadonlyArray<{ readonly work: string; readonly program: Effect.Effect<void> }> = [
  { work: 'two steps of work', program: briefWork },
  { work: 'two hundred steps of work', program: longWork },
]

Feature('The children a kernel run starts, and whether they are still running when it ends')
  .live('each scenario drives the simulation kernel itself, and a kernel run cannot run inside a kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'Children started straight away that do <work> all finish with their names',
      childWork,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a program that starts alpha, beta, and gamma straight away, each doing ${row.work}`)(
            'program',
            () => Effect.succeed(childrenStartedStraightAway(row.program)),
          ),
          When('the program runs')('run', (s) => Effect.promise(() => Kernel.run(s.program))),
          Then('the run completes with alpha, beta, and gamma, as it does outside the kernel')((s, expect) =>
            expect(completedValueOf(s.run)).toEqual(CHILD_NAMES)
          ),
        ),
    )

    scenario(
      'A child left suspended when the root exits is named with the frame it waits in',
      Gherkin.Do.pipe(
        Given('a program that leaves a child waiting on a value nobody sends')(
          'program',
          () => Effect.succeed(rootLeavingDetachedChild),
        ),
        When('the program runs')('run', (s) => Effect.promise(() => Kernel.run(s.program))),
        Then('the run names the one child still running, with the frame it stopped in')((s, expect) => {
          const leftRunning = completedRunOf(s.run).leftRunning
          return expect({ running: leftRunning, total: leftRunning.length }).toMatchObject({
            running: expect.schemaMatching(
              Schema.Array(Schema.Struct({ frames: Schema.NonEmptyArray(Schema.Unknown) })),
            ),
            total: 1,
          })
        }),
      ),
    )

    scenario(
      'A root whose children all finish leaves none running',
      Gherkin.Do.pipe(
        Given('a program whose children all finish before it returns')(
          'program',
          () => Effect.succeed(childrenStartedStraightAway(briefWork)),
        ),
        When('the program runs')('run', (s) => Effect.promise(() => Kernel.run(s.program))),
        Then('the run reports nothing left running')((s, expect) =>
          expect(completedRunOf(s.run).leftRunning).toEqual([])
        ),
      ),
    )

    scenario(
      'A root stopped while its scoped child still works closes its scope and leaves none running',
      Gherkin.Do.pipe(
        Given('a program whose only child lives in its scope and is still working')(
          'program',
          () => Effect.succeed(rootWithScopedChild),
        ),
        When('the kernel stops the root')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.program, { interrupt: { atStep: 1 } })),
        ),
        Then('the run reports nothing left running')((s, expect) =>
          expect(completedRunOf(s.run).leftRunning).toEqual([])
        ),
      ),
    )
  })
