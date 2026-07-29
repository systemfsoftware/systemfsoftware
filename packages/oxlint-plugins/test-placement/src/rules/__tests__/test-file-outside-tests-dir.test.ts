import {
  STRAY_TEST_FILE_ACTUAL,
  STRAY_TEST_FILE_EXPECTED,
  STRAY_TEST_FILE_FIX,
} from '../test-file-outside-tests-dir.config.js'
import { testFileOutsideTestsDir } from '../test-file-outside-tests-dir.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

ruleTester.run('test-file-outside-tests-dir', testFileOutsideTestsDir, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/tests/a.integration.test.ts',
    },
    {
      name: 'Should_Allow_FeatureTest_When_InUnderscoreTestsDir',
      code: '',
      filename: '/repo/pkg/__tests__/a.feature.test.ts',
    },
    {
      name: 'Should_Allow_SrcPropertyTest_When_UnderSrc',
      code: '',
      filename: '/repo/pkg/src/a.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_NonTestFile_When_AtRepoRoot',
      code: '',
      filename: '/repo/pkg/index.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StrayIntegrationTest_When_OutsideTestsDir',
      code: '',
      filename: '/repo/pkg/a.integration.test.ts',
      errors: [{
        messageId: 'strayTestFile',
        data: {
          name: 'a.integration.test.ts',
          expected: STRAY_TEST_FILE_EXPECTED,
          actual: STRAY_TEST_FILE_ACTUAL,
          fix: STRAY_TEST_FILE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_StrayFeatureTest_When_InUnrelatedLibDir',
      code: '',
      filename: '/repo/pkg/lib/a.feature.test.ts',
      errors: [{
        messageId: 'strayTestFile',
        data: {
          name: 'a.feature.test.ts',
          expected: STRAY_TEST_FILE_EXPECTED,
          actual: STRAY_TEST_FILE_ACTUAL,
          fix: STRAY_TEST_FILE_FIX,
        },
      }],
    },
  ],
})
