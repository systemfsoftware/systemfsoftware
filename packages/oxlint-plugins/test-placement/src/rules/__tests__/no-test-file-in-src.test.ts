import {
  TEST_FILE_IN_SRC_ACTUAL,
  TEST_FILE_IN_SRC_EXPECTED,
  TEST_FILE_IN_SRC_FIX,
} from '../no-test-file-in-src.config.js'
import { noTestFileInSrc } from '../no-test-file-in-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

ruleTester.run('no-test-file-in-src', noTestFileInSrc, {
  valid: [
    {
      name: 'Should_Allow_PropertyTestInSrc_When_BesidesWorkflow',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_NonTestFileInSrc_When_WorkflowSource',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.ts',
    },
    {
      name: 'Should_Allow_IntegrationTestOutsideSrc_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/tests/confirm-order.integration.test.ts',
    },
    {
      name: 'Should_Allow_FeatureTestOutsideSrc_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/__tests__/confirm-order.feature.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_PlainTestInSrc_When_NotProperty',
      code: '',
      filename: '/repo/pkg/src/hook-timeout.test.ts',
      errors: [{
        messageId: 'testFileInSrc',
        data: {
          name: 'hook-timeout.test.ts',
          expected: TEST_FILE_IN_SRC_EXPECTED,
          actual: TEST_FILE_IN_SRC_ACTUAL,
          fix: TEST_FILE_IN_SRC_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SpecInSrc_When_NotProperty',
      code: '',
      filename: '/repo/pkg/src/foo.spec.ts',
      errors: [{
        messageId: 'testFileInSrc',
        data: {
          name: 'foo.spec.ts',
          expected: TEST_FILE_IN_SRC_EXPECTED,
          actual: TEST_FILE_IN_SRC_ACTUAL,
          fix: TEST_FILE_IN_SRC_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NestedTestInSrc_When_InsideDeeperDir',
      code: '',
      filename: '/repo/pkg/src/nested/a.test.ts',
      errors: [{
        messageId: 'testFileInSrc',
        data: {
          name: 'a.test.ts',
          expected: TEST_FILE_IN_SRC_EXPECTED,
          actual: TEST_FILE_IN_SRC_ACTUAL,
          fix: TEST_FILE_IN_SRC_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_TestInSrcTestsDir_When_StillUnderSrc',
      code: '',
      filename: '/repo/pkg/src/__tests__/a.test.ts',
      errors: [{
        messageId: 'testFileInSrc',
        data: {
          name: 'a.test.ts',
          expected: TEST_FILE_IN_SRC_EXPECTED,
          actual: TEST_FILE_IN_SRC_ACTUAL,
          fix: TEST_FILE_IN_SRC_FIX,
        },
      }],
    },
  ],
})
