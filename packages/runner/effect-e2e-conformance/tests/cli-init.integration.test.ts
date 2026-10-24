import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'

import { generatedSuite, runGeneratedSuite } from './__fixtures__/cli-suite.fixture.js'
import { servedHeadingSite } from './__fixtures__/heading-site-server.js'

const Feature = makeFeature({ it })

const DETERMINISTIC = 'the home page shows a heading'
const AGENT = 'a visitor reaches the top of the home page'

Feature('Running the suite effect-e2e init generates')
  .withLayer(Layer.empty)
  .live('each scenario scaffolds a suite with the linked bin and runs its test:e2e command in a nested process')
  .body(({ scenario }) => {
    scenario(
      'With no model key, the deterministic example passes with zero model calls and the agent example is skipped naming the key',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a page with a heading served on loopback')('site', () => servedHeadingSite),
        Given('a suite init scaffolded for the web engine and the openrouter gateway')('suite', () => generatedSuite),
        When('test:e2e runs with BASE_URL at the page and no OPENROUTER_API_KEY')(
          'run',
          ({ suite, site }) => runGeneratedSuite({ suite, baseUrl: site }),
        ),
        Then('the run exits 0, the example passes, and the agent example is skipped for the missing key')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: s.run.vitest,
            e2e: s.run.e2e,
            modelCalls: s.run.modelCalls,
            namesTheKey: s.run.skipReasons.map((reason) => reason.includes('OPENROUTER_API_KEY')),
          }).toEqual({
            exitCode: 0,
            vitest: { [DETERMINISTIC]: 'passed', [AGENT]: 'skipped' },
            e2e: { [DETERMINISTIC]: 'passed', [AGENT]: 'skipped' },
            modelCalls: 0,
            namesTheKey: [true],
          })
        ),
      ),
    )
  })
