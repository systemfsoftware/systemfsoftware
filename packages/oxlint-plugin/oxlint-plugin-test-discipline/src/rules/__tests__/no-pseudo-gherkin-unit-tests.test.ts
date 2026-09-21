import {
  NO_LAYER_IN_FEATURE_ACTUAL,
  NO_LAYER_IN_FEATURE_EXPECTED,
  NO_LAYER_IN_FEATURE_FIX,
  NO_LAYER_IN_FEATURE_NAME,
} from '../no-pseudo-gherkin-unit-tests.config.js'
import { noPseudoGherkinUnitTests } from '../no-pseudo-gherkin-unit-tests.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORT = `
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
const Feature = makeFeature({ it, layer })
const testLayer = Layer.empty
`

ruleTester.run('no-pseudo-gherkin-unit-tests', noPseudoGherkinUnitTests, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureUsesWithLayer',
      code: `${FEATURE_IMPORT}
Feature('feature capability')
  .withLayer(testLayer)
  .body(({ scenario }) => {})
`,
      filename: '/repo/pkg/tests/order.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureUsesWithScenarioLayer',
      code: `${FEATURE_IMPORT}
Feature('feature capability')
  .withScenarioLayer(testLayer)
  .body(({ scenario }) => {})
`,
      filename: '/repo/pkg/tests/order.integration.test.ts',
    },
    {
      name: 'Should_Allow_NonIntegrationTest_When_NoLayerUsed',
      code: `${FEATURE_IMPORT}
Feature('feature capability')
  .body(({ scenario }) => {})
`,
      filename: '/repo/pkg/tests/order.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Reject_IntegrationTest_When_FeatureHasNoLayers',
      code: `${FEATURE_IMPORT}
Feature('pure feature without layers')
  .body(({ scenario }) => {})
`,
      filename: '/repo/pkg/tests/pure.integration.test.ts',
      errors: [
        {
          message:
            `${NO_LAYER_IN_FEATURE_NAME} is forbidden. Expected: ${NO_LAYER_IN_FEATURE_EXPECTED}. Actual: ${NO_LAYER_IN_FEATURE_ACTUAL}. Fix: ${NO_LAYER_IN_FEATURE_FIX}.`,
        },
      ],
    },
  ],
})
