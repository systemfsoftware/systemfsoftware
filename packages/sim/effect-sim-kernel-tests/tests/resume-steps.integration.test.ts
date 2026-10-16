import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer } from 'effect'
import { completedRunOf } from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it })

const yieldingProgram = Effect.gen(function*() {
  yield* Effect.yieldNow
  return 'done'
})

/**
 * The one-based step numbers where one fiber's resume step follows another
 * resume step of the same fiber. A resume that runs inline is followed by what
 * it does — the fiber's next slice, then its continuation — so the only way two
 * resume steps of one fiber land back to back is a resume that spent a second
 * scheduling step on itself, which is what Effect 4.0.1's async-context restore
 * did before the kernel folded that nested call into its first resume.
 */
const backToBackResumes = (steps: ReadonlyArray<Kernel.StepRecord>): ReadonlyArray<number> =>
  steps.flatMap((step, index) => {
    const previous = steps[index - 1]
    if (previous === undefined) return []
    return step.external && previous.external && step.fiberId === previous.fiberId ? [index + 1] : []
  })

Feature('Resuming a fiber in one kernel step')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A program that yields once and finishes resumes without a second step spent on it',
      Gherkin.Do.pipe(
        Given('a program that yields once and finishes')(
          'contest',
          () => Effect.succeed(yieldingProgram),
        ),
        When('the program runs')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.contest)),
        ),
        Then('the run resumes the fiber in no two consecutive steps')((s, expect) =>
          expect(backToBackResumes(completedRunOf(s.run).steps)).toEqual([])
        ),
      ),
    )
  })
