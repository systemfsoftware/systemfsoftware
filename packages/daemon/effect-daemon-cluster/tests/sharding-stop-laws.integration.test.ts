import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'
import { Sharding } from 'effect/unstable/cluster'
import { scriptedSharding } from './__fixtures__/scripted-sharding.fixture.js'
import { shardingStopLawResults } from './__fixtures__/sharding-stop-laws.fixture.js'

const Feature = makeFeature({ it })

const restartWorld = Effect.map(Layer.build(scriptedSharding), (env) => Context.get(env, Sharding.Sharding))

Feature('Stopping a cluster child that holds a name')
  .withScenarioLayer(scriptedSharding)
  .live('the scripted sharding the cluster medium registers its children through')
  .body(({ scenario }) => {
    scenario(
      'A child is interrupted when its owner stops, and its name is free for a restart',
      Gherkin.Do.pipe(
        Given('a cluster owner that holds the names its children register')(
          'world',
          () => Effect.void,
        ),
        When('a child is stopped mid-call and then started again')(
          'checked',
          () => shardingStopLawResults(restartWorld),
        ),
        Then('the child ran, stopped, and the restarted child ran again')((s, expect) =>
          expect(s.checked.map((result) => result.broken)).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
          ])
        ),
      ),
    )
  })
