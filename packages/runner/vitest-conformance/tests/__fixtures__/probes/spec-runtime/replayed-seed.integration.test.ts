import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { readShelfCounter } from './explored-rerun.fixture.js'

const Feature = makeFeature({ it })

Feature('An explored scenario replaying a recorded seed')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A scenario with no choice point reads a counter that outlives its run',
      Gherkin.Do.pipe(
        Given('the shelf counter is read and advanced')('reading', () => readShelfCounter),
        Then('the shelf counter read zero')((s, expect) => expect(s.reading).toEqual(0)),
      ),
    )
  })
