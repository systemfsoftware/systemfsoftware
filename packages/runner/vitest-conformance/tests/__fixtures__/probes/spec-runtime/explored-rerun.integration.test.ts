import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { counted, readShelfCounter, shelvedByTwoClerks } from './explored-rerun.fixture.js'

const Feature = makeFeature({ it })

Feature('Explored scenarios and their second run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A scenario with no choice point passes',
      Gherkin.Do.pipe(
        Given('the run is counted')('run', () => counted('no choice point')),
        Then('the run was counted')((s, expect) => expect(s.run).toEqual('no choice point')),
      ),
    )

    scenario(
      'A scenario with a choice point passes',
      Gherkin.Do.pipe(
        Given('the run is counted')('run', () => counted('choice point')),
        When('two clerks shelve a book each')('shelved', () => shelvedByTwoClerks),
        Then('both books are on the shelf')((s, expect) => expect(s.shelved).toEqual(2)),
      ),
    )

    scenario(
      'A scenario with no choice point reads a counter that outlives its run',
      Gherkin.Do.pipe(
        Given('the shelf counter is read and advanced')('reading', () => readShelfCounter),
        Then('the shelf counter read zero')((s, expect) => expect(s.reading).toEqual(0)),
      ),
    )
  })
