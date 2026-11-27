import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { makeLedger, probeStack } from './__fixtures__/probe-stack.fixture.js'

const Feature = makeFeature({ it })

const ledger = makeLedger()

const LocalByConfig = alchemyStack('LocalByConfig', {
  dev: true,
  deploy: probeStack({ ledger, stackName: 'LocalByConfig' }),
})

Feature('the engine toggle decides where a stack deploys')
  .withLayer(LocalByConfig.layer)
  .body(({ scenario }) => {
    scenario(
      'a config that says dev deploys to the cloud when the engine toggle says cloud',
      Gherkin.Do.pipe(
        Given('the stack configured for dev is deployed while the toggle is off')('stack', () => LocalByConfig),
        Then('its deploy ran against the cloud target')((s, expect) =>
          expect({ label: s.stack.label, devFlags: ledger.entries.map((entry) => entry.dev) }).toEqual({
            label: 'LocalByConfig',
            devFlags: [false],
          })
        ),
      ),
    )
  })
