import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer } from 'effect'
import { completedValueOf } from './__fixtures__/kernelFixtures.js'
import {
  briefWork,
  CHILD_NAMES,
  childrenStartedStraightAway,
  longWork,
} from './__fixtures__/startedChildrenFixtures.js'

const Feature = makeFeature({ it })

const childWork: ReadonlyArray<{ readonly work: string; readonly program: Effect.Effect<void> }> = [
  { work: 'two steps of work', program: briefWork },
  { work: 'two hundred steps of work', program: longWork },
]

Feature('Keeping children a program starts straight away alive inside the run')
  .live('each scenario drives the simulation kernel itself, and a kernel run cannot run inside a kernel run')
  .withLayer(Layer.empty)
  .body(({ scenarioOutline }) => {
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
          Then('the run completes with alpha, beta, and gamma, as it does outside the kernel')((s) => {
            expect(completedValueOf(s.run)).toEqual(CHILD_NAMES)
          }),
        ),
    )
  })
