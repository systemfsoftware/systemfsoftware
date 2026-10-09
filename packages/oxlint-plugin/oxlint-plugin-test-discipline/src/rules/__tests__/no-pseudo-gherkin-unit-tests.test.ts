import {
  NO_LAYER_IN_FEATURE_ACTUAL,
  NO_LAYER_IN_FEATURE_EXPECTED,
  NO_LAYER_IN_FEATURE_FIX,
  NO_LAYER_IN_FEATURE_NAME,
} from '../no-pseudo-gherkin-unit-tests.config.js'
import { noPseudoGherkinUnitTests } from '../no-pseudo-gherkin-unit-tests.js'
import { createRuleTester, everywhere } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORT = `
import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
const Feature = makeFeature({ it })
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
    ...everywhere({
      name: 'Should_Allow_Test_When_NoGherkinHarnessImported',
      code: `
const Feature = (name: string) => ({ body: (f: unknown) => f })
Feature('feature capability')
  .body(({ scenario }) => {})
`,
    }),
  ],
  invalid: [
    ...everywhere({
      name: 'Should_Reject_BehaviourTest_When_FeatureHasNoLayers',
      code: `${FEATURE_IMPORT}
Feature('pure feature without layers')
  .body(({ scenario }) => {})
`,
      errors: [
        {
          message:
            `${NO_LAYER_IN_FEATURE_NAME} is forbidden. Expected: ${NO_LAYER_IN_FEATURE_EXPECTED}. Actual: ${NO_LAYER_IN_FEATURE_ACTUAL}. Fix: ${NO_LAYER_IN_FEATURE_FIX}.`,
        },
      ],
    }),
  ],
})
