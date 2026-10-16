import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { counted, shelvedByTwoClerks } from './explored-rerun.fixture.js'

const Feature = makeFeature({ it })

Feature('An explored scenario replaying a recorded decision path')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A scenario with a choice point replays the named path',
      Gherkin.Do.pipe(
        Given('the run is counted')('run', () => counted('replayed path')),
        When('two clerks shelve a book each')('shelved', () => shelvedByTwoClerks),
        Then('both books are on the shelf')((s, expect) => expect(s.shelved).toEqual(2)),
      ),
    )
  })
