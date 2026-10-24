import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'

import { runCli, statusesOf } from './__fixtures__/cli-run.fixture.js'
import { generatedSuite } from './__fixtures__/cli-suite.fixture.js'
import { servedHeadingSite } from './__fixtures__/heading-site-server.js'

const Feature = makeFeature({ it })

const DETERMINISTIC = 'the home page shows a heading'
const AGENT = 'a visitor reaches the top of the home page'

const NOTHING_LISTENS = 'http://127.0.0.1:9'

Feature('Running a suite effect-e2e init generates with effect-e2e run')
  .withLayer(Layer.empty)
  .live('each scenario scaffolds a suite with the linked bin and runs it in a real browser through the run command')
  .body(({ scenario }) => {
    scenario(
      'A run that names its own output prints the JSON report and writes the merged report there',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a page with a heading served on loopback')('site', () => servedHeadingSite),
        Given('a suite init scaffolded for the web engine and the openrouter gateway')('suite', () => generatedSuite),
        When('the run reports as JSON into an evidence directory, with the page as the app and no model key')(
          'run',
          ({ suite, site }) =>
            runCli({
              suite,
              args: ['--reporter', 'json', '--output', 'evidence'],
              env: { BASE_URL: site },
              output: 'evidence',
            }),
        ),
        Then('the run exits 0, and the printed and written reports both pass the example and skip the agent')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            printed: statusesOf(s.run.printed),
            written: statusesOf(s.run.report),
          }).toEqual({
            exitCode: 0,
            printed: { [DETERMINISTIC]: 'passed', [AGENT]: 'skipped' },
            written: { [DETERMINISTIC]: 'passed', [AGENT]: 'skipped' },
          })
        ),
      ),
    )

    scenario(
      'A run whose app cannot be reached ends blocked with exit 3',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite init scaffolded for the web engine and the openrouter gateway')('suite', () => generatedSuite),
        When('the run points the app at a loopback port nothing listens on')(
          'run',
          ({ suite }) => runCli({ suite, args: ['tests/example.e2e.ts'], env: { BASE_URL: NOTHING_LISTENS } }),
        ),
        Then('the run exits 3 and the report holds the example as blocked')((s, expect) =>
          expect({ exitCode: s.run.exitCode, report: statusesOf(s.run.report) }).toEqual({
            exitCode: 3,
            report: { [DETERMINISTIC]: 'blocked' },
          })
        ),
      ),
    )
  })
