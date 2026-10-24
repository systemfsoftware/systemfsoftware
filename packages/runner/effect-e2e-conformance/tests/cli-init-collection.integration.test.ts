import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { collectedUnder, generatedSuite, plantIn } from './__fixtures__/cli-suite.fixture.js'

const Feature = makeFeature({ it })

const UNIT_TEST = "import { test } from 'vitest'\n\ntest('adds', () => {})\n"

const VITEST_DEFAULTS_CONFIG = 'export default {}\n'

Feature('Keeping e2e tests and unit tests apart in a suite init generates')
  .withLayer(Layer.empty)
  .live('each scenario scaffolds a suite with the linked bin and lists what Vitest collects in a nested process')
  .body(({ scenario }) => {
    scenario(
      'test:e2e collects the two .e2e.ts examples and not a unit test, and the unit runner collects only the unit test',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite init scaffolded for the web engine and the openrouter gateway')('suite', () => generatedSuite),
        Given('a unit test at tests/unit.test.ts and a unit runner config with Vitest defaults')(
          'planted',
          ({ suite }) =>
            Effect.andThen(
              plantIn({ suite, file: 'tests/unit.test.ts', content: UNIT_TEST }),
              plantIn({ suite, file: 'unit.vitest.config.ts', content: VITEST_DEFAULTS_CONFIG }),
            ),
        ),
        When('Vitest lists the files each config collects')('collected', ({ suite }) =>
          Effect.all({
            e2e: collectedUnder({ suite, config: 'vitest.config.ts' }),
            unit: collectedUnder({ suite, config: 'unit.vitest.config.ts' }),
          })),
        Then('the two sets are disjoint: the examples under test:e2e, the unit test under the unit runner')((
          s,
          expect,
        ) =>
          expect(s.collected).toEqual({
            e2e: ['tests/example-agent.e2e.ts', 'tests/example.e2e.ts'],
            unit: ['tests/unit.test.ts'],
          })
        ),
      ),
    )
  })
