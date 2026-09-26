import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { spawnerLayer } from './__fixtures__/process-fixtures.js'
import { runSpawnerLaws, spawnerLaws } from './__fixtures__/spawner-laws.fixture.js'

const Feature = makeFeature({ it })

Feature('The laws the real operating-system spawner keeps')
  .withLayer(Layer.empty)
  .live('the laws spawn, signal and reap real operating-system child processes')
  .body(({ scenario }) => {
    scenario(
      'Every law the spawner must keep holds against the real operating-system spawner',
      Gherkin.Do.pipe(
        Given('the laws a child-process spawner must keep')('laws', () => Effect.succeed(spawnerLaws)),
        When('every law runs against the real operating-system spawner')(
          'verdicts',
          () => runSpawnerLaws(spawnerLayer),
        ),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(s.laws.map((law) => `${law.name}: holds`))),
      ),
    )
  })
