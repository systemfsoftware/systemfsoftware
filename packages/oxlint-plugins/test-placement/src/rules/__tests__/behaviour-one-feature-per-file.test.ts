import {
  TOO_FEW_FEATURES_ACTUAL,
  TOO_FEW_FEATURES_EXPECTED,
  TOO_FEW_FEATURES_FIX,
  TOO_FEW_FEATURES_NAME,
  TOO_MANY_FEATURES_ACTUAL,
  TOO_MANY_FEATURES_EXPECTED,
  TOO_MANY_FEATURES_FIX,
  TOO_MANY_FEATURES_NAME,
} from '../behaviour-one-feature-per-file.config.js'
import { behaviourOneFeaturePerFile } from '../behaviour-one-feature-per-file.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_DECL = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'

const Feature = makeFeature({ it, layer })
`

ruleTester.run('behaviour-one-feature-per-file', behaviourOneFeaturePerFile, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureCalledExactlyOnce',
      code: `${FEATURE_DECL}
Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureCalledOnceAcrossManyLines',
      code: `${FEATURE_DECL}
Feature(
  'capability name',
  () => {
    return {}
  },
)
`,
      filename: '/repo/pkg/__tests__/cap.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureCalledViaBodyChain',
      code: `${FEATURE_DECL}
Feature('x').body(({ scenario }) => {})
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_FeatureCalledViaDeeplyChainedBuilder',
      code: `${FEATURE_DECL}
Feature('x', { timeout: 30_000 }).withLayer(layer).liveClock().body(({ scenario }) => {})
`,
      filename: '/repo/pkg/__tests__/cap.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_NonFeatureCallExpressionsPresent',
      code: `${FEATURE_DECL}
Feature('x', () => {})
sideEffect();
sideEffect();
`,
      filename: '/repo/pkg/__tests__/side.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_NonCallExpressionSideStatementsPresent',
      code: `${FEATURE_DECL}
'setup side effect';
Feature('x', () => {})
'teardown side effect';
`,
      filename: '/repo/pkg/__tests__/side.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItAlsoCallsFeatureOnce_DifferentSuffix',
      code: `${FEATURE_DECL}
Feature('x', () => {})
`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TooFewFeatures_When_NoFeatureCallAppears',
      code: `${FEATURE_DECL}
const x = 1
`,
      filename: '/repo/pkg/__tests__/empty.integration.test.ts',
      errors: [{
        messageId: 'tooFewFeatures',
        data: {
          name: TOO_FEW_FEATURES_NAME,
          expected: TOO_FEW_FEATURES_EXPECTED,
          actual: TOO_FEW_FEATURES_ACTUAL,
          fix: TOO_FEW_FEATURES_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_TooManyFeatures_When_TwoFeatureCalls',
      code: `${FEATURE_DECL}
Feature('one', () => {})
Feature('two', () => {})
`,
      filename: '/repo/pkg/__tests__/two.integration.test.ts',
      errors: [{
        messageId: 'tooManyFeatures',
        data: {
          name: TOO_MANY_FEATURES_NAME,
          expected: TOO_MANY_FEATURES_EXPECTED,
          actual: `${TOO_MANY_FEATURES_ACTUAL} (2 found)`,
          fix: TOO_MANY_FEATURES_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_TooManyFeatures_When_TwoChainedFeatureCalls',
      code: `${FEATURE_DECL}
Feature('one').body(({ scenario }) => {})
Feature('two').body(({ scenario }) => {})
`,
      filename: '/repo/pkg/__tests__/two.integration.test.ts',
      errors: [{
        messageId: 'tooManyFeatures',
        data: {
          name: TOO_MANY_FEATURES_NAME,
          expected: TOO_MANY_FEATURES_EXPECTED,
          actual: `${TOO_MANY_FEATURES_ACTUAL} (2 found)`,
          fix: TOO_MANY_FEATURES_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_TooManyFeatures_When_ManyFeatureCallsAccumulate',
      code: `${FEATURE_DECL}
Feature('one', () => {})
Feature('two', () => {})
Feature('three', () => {})
Feature('four', () => {})
`,
      filename: '/repo/pkg/__tests__/junk.integration.test.ts',
      errors: [{
        messageId: 'tooManyFeatures',
        data: {
          name: TOO_MANY_FEATURES_NAME,
          expected: TOO_MANY_FEATURES_EXPECTED,
          actual: `${TOO_MANY_FEATURES_ACTUAL} (4 found)`,
          fix: TOO_MANY_FEATURES_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_TooManyFeatures_When_OtherStatementsIntersperseFeatures',
      code: `${FEATURE_DECL}
const before = 1
Feature('one', () => {})
const middle = 2
Feature('two', () => {})
const after = 3
`,
      filename: '/repo/pkg/__tests__/mix.integration.test.ts',
      errors: [{
        messageId: 'tooManyFeatures',
        data: {
          name: TOO_MANY_FEATURES_NAME,
          expected: TOO_MANY_FEATURES_EXPECTED,
          actual: `${TOO_MANY_FEATURES_ACTUAL} (2 found)`,
          fix: TOO_MANY_FEATURES_FIX,
        },
      }],
    },
  ],
})
