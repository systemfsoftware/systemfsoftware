import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer } from 'effect'
import { failingStory } from './__fixtures__/failure-corpus/failing-story.js'
import { verdictOrNull } from './__fixtures__/failure-corpus/record.js'

const Feature = makeFeature({ it })

Feature('The storybook gherkin family prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the corpus plays a story through the play edge in the conformance project')
  .body(({ scenario }) => {
    scenario(
      'A failing story step yields a record naming its defect file and starting at the raising frame',
      Gherkin.Do.pipe(
        Given('a defective story whose step failure the corpus renders')(
          'record',
          () => Effect.promise(() => recordOfRun(failingStory.program)),
        ),
        Then('the record names the defect file and starts at the raising frame')((s, expect) =>
          expect(verdictOrNull({ record: s.record, fixture: failingStory })).toMatchObject({
            name: 'StepMishap',
            namesDefectFile: true,
            hasHeadline: true,
            firstLocationFile: failingStory.raisingFile,
            breaches: [],
          })
        ),
      ),
    )
  })
