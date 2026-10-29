import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { generatedSuite, plantIn, retriesWrittenIn, runGeneratedSuite } from './__fixtures__/cli-suite.fixture.js'
import { servedHeadingSite } from './__fixtures__/heading-site-server.js'

const Feature = makeFeature({ it })

const DETERMINISTIC = 'Should_ShowAHeading_When_TheHomePageOpens'
const AGENT = 'Should_ReachTheTopOfThePage_When_TheAgentScrolls'
const NEVER_HOLDS = 'a sum that never holds'

const NEVER_HOLDING_TEST = `import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test(${JSON.stringify(NEVER_HOLDS)}, () => {
  expect(2 + 2).toBe(5)
})
`

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

    scenario(
      "A generated suite retries a failing test as many times as its config's retries say",
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a page with a heading served on loopback')('site', () => servedHeadingSite),
        Given('a suite init scaffolded whose config sets two retries and which holds a test that always fails')(
          'suite',
          () =>
            Effect.tap(generatedSuite, (suite) =>
              Effect.andThen(
                retriesWrittenIn({ suite, retries: 2 }),
                plantIn({ suite, file: 'tests/never-holds.e2e.ts', content: NEVER_HOLDING_TEST }),
              )),
        ),
        When('test:e2e runs with BASE_URL at the page')(
          'run',
          ({ suite, site }) => runGeneratedSuite({ suite, baseUrl: site }),
        ),
        Then('the failing test has three tries, the passing example one, and the run exits 1')((s, expect) =>
          expect({ exitCode: s.run.exitCode, attempts: s.run.attempts }).toEqual({
            exitCode: 1,
            attempts: { [DETERMINISTIC]: 1, [AGENT]: 1, [NEVER_HOLDS]: 3 },
          })
        ),
      ),
    )
  })
