import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'

import { everyStepSettled, freshVisit, playedOnce } from './__fixtures__/story-leave.fixture.js'

const Feature = makeFeature({ it })

Feature('Leaving a story with nothing hanging when the visit moves on', { timeout: 120_000 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A story the visit walks away from mid-step leaves no step waiting for it',
      Gherkin.Do.pipe(
        Given('a visit to a story that greets Alice by name in three steps')('visit', () => Effect.sync(freshVisit)),
        When('the visit moves on at every step of the story')(
          'checked',
          (s) => Conformance.released(playedOnce(s.visit), { probe: everyStepSettled(s.visit) }),
        ),
        Then('no step is left hanging and the visit moved on at least once')((s, expect) =>
          expect(s.checked).toMatchObject({
            _tag: 'Pass',
            histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
