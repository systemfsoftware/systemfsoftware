import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'

import { decodeSuiteConfig, runBin, scratchRoot } from './__fixtures__/cli.fixture.js'

const Feature = makeFeature({ it })

const DEPLOYMENT = 'http://127.0.0.1:4173'

const scaffold = (root: string, gateway: string) =>
  runBin({
    cwd: root,
    args: ['init', '--dir', 'checkout-e2e', '--engine', 'web', '--gateway', gateway, '--no-install'],
  })

const GATEWAYS = [
  { gateway: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY' },
  { gateway: 'openai-compatible', apiKeyEnv: 'OPENAI_API_KEY' },
] as const

Feature("Decoding the config init generates against the framework's published schema")
  .withLayer(Layer.empty)
  .live('each scenario scaffolds a suite with the built bin and decodes its e2e.config.ts in a Node process')
  .body(({ scenario }) => {
    for (const { gateway, apiKeyEnv } of GATEWAYS) {
      scenario(
        `The ${gateway} config decodes to the suite, one web target at BASE_URL, and the ${gateway} gateway`,
        { scenarioLayer: NodeServices.layer },
        Gherkin.Do.pipe(
          Given('a scratch directory inside the CLI package, so the suite resolves the framework')(
            'root',
            () => scratchRoot,
          ),
          Given(`a suite init scaffolded for the ${gateway} gateway`)('run', ({ root }) => scaffold(root, gateway)),
          When("the framework decodes the suite's config with BASE_URL set to the deployment")(
            'outcome',
            ({ root }) => decodeSuiteConfig({ suite: `${root}/checkout-e2e`, baseUrl: DEPLOYMENT }),
          ),
          Then('the decoded config is the suite the flags and the environment described')((s, expect) =>
            expect({ exitCode: s.run.exitCode, outcome: s.outcome }).toMatchObject({
              exitCode: 0,
              outcome: {
                _tag: 'Decoded',
                config: {
                  projectId: 'checkout-e2e',
                  targets: [{
                    name: 'web',
                    engine: { adapter: '@systemfsoftware/effect-e2e-web' },
                    app: { url: DEPLOYMENT },
                  }],
                  agents: { default: { model: { gateway, apiKeyEnv } } },
                },
              },
            })
          ),
        ),
      )
    }

    scenario(
      'One unknown key added to the generated config is refused with CONFIG_INVALID naming that key',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a scratch directory inside the CLI package, so the suite resolves the framework')(
          'root',
          () => scratchRoot,
        ),
        Given('a suite init scaffolded for the openrouter gateway')('run', ({ root }) => scaffold(root, 'openrouter')),
        When("the framework decodes the config with a top-level 'retry' typo added")(
          'outcome',
          ({ root }) => decodeSuiteConfig({ suite: `${root}/checkout-e2e`, baseUrl: DEPLOYMENT, extraKey: 'retry' }),
        ),
        Then('the refusal is CONFIG_INVALID at the path of the unknown key')((s, expect) =>
          expect(s.outcome).toEqual({ _tag: 'Refused', refusal: { tag: 'ConfigInvalid', path: ['retry'] } })
        ),
      ),
    )
  })
