import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { everyStepSettled, freshVisit, passOf, playedOnce } from './__fixtures__/story-leave.fixture.js'

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
        Then('no step is left hanging once the visit has moved on')((s) => {
          passOf(s.checked)
        }),
        And('the visit moved on at least once')((s) => {
          if (passOf(s.checked).histories <= 0) {
            throw new Error('expected the visit to have moved on at least once')
          }
        }),
      ),
    )
  })
