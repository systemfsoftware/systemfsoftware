import {
  UNSANCTIONED_SUFFIX_ACTUAL,
  UNSANCTIONED_SUFFIX_EXPECTED,
  UNSANCTIONED_SUFFIX_FIX,
} from '../test-suffix-outside-src.config.js'
import { testSuffixOutsideSrc } from '../test-suffix-outside-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

ruleTester.run('test-suffix-outside-src', testSuffixOutsideSrc, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/tests/a.integration.test.ts',
    },
    {
      name: 'Should_Allow_NonTestFile_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/lib/helper.ts',
    },
    {
      name: 'Should_Allow_AnyFileInSrc_When_RuleInactiveUnderSrc',
      code: '',
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_BareTestUnderSrc_When_SuffixRuleIsOutsideSrcOnly',
      code: '',
      filename: '/repo/pkg/src/a.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_FeatureTest_When_RetiredSuffixIsStillUsed',
      code: '',
      filename: '/repo/pkg/tests/a.feature.test.ts',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.feature.test.ts',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_BareTest_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/tests/a.test.ts',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.test.ts',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_BareTest_When_OutsideSrcUnderSanctionedTestsDir',
      code: '',
      filename: '/repo/pkg/__tests__/a.test.ts',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.test.ts',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SpecFile_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/tests/a.spec.ts',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.spec.ts',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_PropertyTest_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/tests/a.property.test.ts',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.property.test.ts',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTestTsx_When_NotTsExtension',
      code: '',
      filename: '/repo/pkg/tests/a.integration.test.tsx',
      errors: [{
        messageId: 'unsanctionedSuffix',
        data: {
          name: 'a.integration.test.tsx',
          expected: UNSANCTIONED_SUFFIX_EXPECTED,
          actual: UNSANCTIONED_SUFFIX_ACTUAL,
          fix: UNSANCTIONED_SUFFIX_FIX,
        },
      }],
    },
  ],
})
