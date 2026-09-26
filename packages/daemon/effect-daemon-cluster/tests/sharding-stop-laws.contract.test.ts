import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ClusterOracle, freshClusterWorld, warmUpCluster } from './__fixtures__/cluster-oracle.js'
import { shardingStopLawResults } from './__fixtures__/sharding-stop-laws.fixture.js'

const Feature = makeFeature({ it })

Feature('Stopping a cluster child that holds a name')
  .withScenarioLayer(ClusterOracle)
  .live('the real SingleRunner over PGlite and Crypto the sharding double stands in for')
  .body(({ scenario }) => {
    scenario(
      'A child is interrupted when its owner stops, and its name is free for a restart',
      Gherkin.Do.pipe(
        Given('a cluster runner that has taken ownership of its shards')(
          'warm',
          () => warmUpCluster,
        ),
        When('a child is stopped mid-call and then started again')(
          'checked',
          () => shardingStopLawResults(freshClusterWorld),
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
