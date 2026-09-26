import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer } from 'effect'
import { giveUp } from './__fixtures__/failure-corpus/give-up.js'
import { verdictOrNull } from './__fixtures__/failure-corpus/record.js'

const Feature = makeFeature({ it })

const CRASHED = 'the crasher lost its basket'

Feature('The daemon supervisor prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the corpus drives the supervisor through its real fiber medium')
  .body(({ scenario }) => {
    scenario(
      'A supervisor that gave up yields a record naming its defect file and carrying the terminated cause',
      Gherkin.Do.pipe(
        Given('a defective supervisor whose give-up the corpus renders')(
          'record',
          () => Effect.promise(() => recordOfRun(giveUp.program)),
        ),
        Then(
          'the record names the defect file, starts at the raising frame and carries the terminated cause',
        )((s, expect) =>
          expect(verdictOrNull({ record: s.record, fixture: giveUp, cause: CRASHED })).toMatchObject({
            name: 'SupervisorTerminated',
            namesDefectFile: true,
            hasHeadline: true,
            hasCauseChain: true,
            firstLocationFile: giveUp.raisingFile,
            breaches: [],
            carriesCause: true,
          })
        ),
      ),
    )
  })
