import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import { defineConfig } from '@systemfsoftware/effect-e2e'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import { makeRunner } from '@systemfsoftware/effect-e2e/runner'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { TestRunner } from 'vitest'

import { GREET_SITE } from './__fixtures__/agent-sites.fixture.js'

const Feature = makeFeature({ it })

const CONFIG = defineConfig({
  targets: [{
    name: 'web',
    engine: { _tag: 'WebEngine', adapter: '@systemfsoftware/effect-e2e-web', browser: 'chromium' },
    app: { url: GREET_SITE.origin, identity: 'greet-app' },
  }],
})

Feature('Building the runner class a suite selects in its vitest config')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'The class makeRunner returns is a Vitest TestRunner, in both call forms',
      Gherkin.Do.pipe(
        When('a suite builds its runner class from its config and composition root')(
          'runners',
          () =>
            Effect.sync(() => {
              const options = {
                platform: Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerUndici),
                engines: {
                  '@systemfsoftware/effect-e2e-web': {
                    identity: { adapter: 'memory', kind: 'web' },
                    version: '0.0.0-test',
                    layer: Engine.layerTest(GREET_SITE),
                  },
                },
                env: {},
                defaults: { ci: false, projectId: 'runner-class', cores: 1 },
                version: '0.0.0-test',
              }
              return [makeRunner(CONFIG, options), makeRunner(options)(CONFIG)]
            }),
        ),
        Then('each class extends the TestRunner Vitest exports')((s, expect) =>
          expect(s.runners.map((Runner) => Runner.prototype instanceof TestRunner)).toEqual([true, true])
        ),
      ),
    )
  })
