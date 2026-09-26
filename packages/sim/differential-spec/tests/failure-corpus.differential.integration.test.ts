import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer } from 'effect'
import { disparity } from './__fixtures__/failure-corpus/disparity.js'
import { verdictOrNull } from './__fixtures__/failure-corpus/record.js'

const Feature = makeFeature({ it })

Feature('The differential family prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the differential check explores its own generated schedules')
  .body(({ scenario }) => {
    scenario(
      'A disparity yields a record naming its defect file and carrying the fast-check seed and path',
      Gherkin.Do.pipe(
        Given('a defective differential comparison whose disparity the corpus renders')(
          'record',
          () => Effect.promise(() => recordOfRun(disparity.program)),
        ),
        Then('the record names the defect file, starts at the raising frame and carries the reproduction')(
          (s, expect) =>
            expect(verdictOrNull({ record: s.record, fixture: disparity })).toMatchObject({
              name: 'DisparityFailure',
              namesDefectFile: true,
              hasHeadline: true,
              carriesDisparity: true,
              hasSeed: true,
              hasPath: true,
              hasReproduction: true,
              firstLocationFile: disparity.raisingFile,
              breaches: [],
            }),
        ),
      ),
    )
  })
