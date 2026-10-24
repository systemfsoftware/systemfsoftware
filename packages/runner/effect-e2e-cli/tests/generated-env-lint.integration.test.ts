import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'

import { OXLINT, runBin, tempRoot, writeText } from './__fixtures__/cli.fixture.js'

const Feature = makeFeature({ it })

// The check: Oxlint's `node/no-process-env` everywhere in the suite except its one environment edge.
const ENV_EDGE_LINT = JSON.stringify({
  plugins: ['node'],
  rules: { 'node/no-process-env': 'error' },
  overrides: [{ files: ['e2e.config.ts'], rules: { 'node/no-process-env': 'off' } }],
})

const PLANTED = "export const baseUrl = process.env['BASE_URL']\n"

const scaffold = (root: string) =>
  runBin({
    cwd: root,
    args: ['init', '--dir', 'suite', '--engine', 'web', '--gateway', 'openrouter', '--no-install'],
  })

const lintSuite = (root: string) =>
  runBin({ cwd: `${root}/suite`, command: OXLINT, args: ['-c', `${root}/env-edge.json`, '.'] })

const withCheck = (root: string) => writeText({ file: `${root}/env-edge.json`, content: ENV_EDGE_LINT })

Feature('Keeping process.env out of every generated file but e2e.config.ts')
  .withLayer(Layer.empty)
  .live('each scenario scaffolds a suite with the built bin and runs the real oxlint over it')
  .body(({ scenario }) => {
    scenario(
      'A freshly generated suite passes the environment-edge lint check',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a suite init scaffolded there')('run', ({ root }) => scaffold(root)),
        Given('the environment-edge lint check')('check', ({ root }) => withCheck(root)),
        When('the check runs over the suite')('lint', ({ root }) => lintSuite(root)),
        Then('it exits 0')((s, expect) =>
          expect({ init: s.run.exitCode, lint: s.lint.exitCode }).toEqual({ init: 0, lint: 0 })
        ),
      ),
    )

    for (const planted of ['tests/planted.e2e.ts', 'runner.ts']) {
      scenario(
        `A process.env read planted in ${planted} fails the check, naming that file`,
        { scenarioLayer: NodeServices.layer },
        Gherkin.Do.pipe(
          Given('an empty temporary directory')('root', () => tempRoot),
          Given('a suite init scaffolded there')('run', ({ root }) => scaffold(root)),
          Given('the environment-edge lint check')('check', ({ root }) => withCheck(root)),
          Given(`${planted} written as a module that reads process.env`)(
            'planted',
            ({ root }) => writeText({ file: `${root}/suite/${planted}`, content: PLANTED }),
          ),
          When('the check runs over the suite')('lint', ({ root }) => lintSuite(root)),
          Then('it exits non-zero, and its report names the planted file and the rule')((s, expect) =>
            expect({
              failed: s.lint.exitCode !== 0,
              file: s.lint.output.includes(planted),
              rule: s.lint.output.includes('no-process-env'),
            }).toEqual({ failed: true, file: true, rule: true })
          ),
        ),
      )
    }
  })
