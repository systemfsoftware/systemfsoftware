import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer } from 'effect'
import { traceBreak } from './__fixtures__/failure-corpus/break.js'
import { verdictOrNull } from './__fixtures__/failure-corpus/record.js'

const Feature = makeFeature({ it })

Feature('The trace family prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the corpus drives a real observation window')
  .body(({ scenario }) => {
    scenario(
      'A trace break yields a record naming its defect file and starting at the raising frame',
      Gherkin.Do.pipe(
        Given('a defective trace contract whose break the corpus renders')(
          'record',
          () => Effect.promise(() => recordOfRun(traceBreak.program)),
        ),
        Then('the record names the defect file and starts at the raising frame')((s, expect) =>
          expect(verdictOrNull({ record: s.record, fixture: traceBreak })).toMatchObject({
            name: 'BreakFailure',
            namesDefectFile: true,
            hasHeadline: true,
            firstLocationFile: traceBreak.raisingFile,
            breaches: [],
          })
        ),
      ),
    )
  })
