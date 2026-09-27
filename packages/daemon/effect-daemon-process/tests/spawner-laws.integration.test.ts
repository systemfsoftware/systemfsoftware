import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { scriptedSpawner } from './__fixtures__/scripted-spawner.fixture.js'
import { runSpawnerLaws, spawnerLaws } from './__fixtures__/spawner-laws.fixture.js'

const Feature = makeFeature({ it })

Feature('The laws a scripted child-process spawner keeps')
  .withLayer(Layer.empty)
  .live('the laws time out and reap children on the runtime clock, not the simulation kernel')
  .body(({ scenario }) => {
    scenario(
      'Every law the spawner must keep holds against the scripted spawner',
      Gherkin.Do.pipe(
        Given('the laws a child-process spawner must keep')('laws', () => Effect.succeed(spawnerLaws)),
        When('every law runs against the scripted spawner')('verdicts', () => runSpawnerLaws(scriptedSpawner)),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(s.laws.map((law) => `${law.name}: holds`))),
      ),
    )
  })
