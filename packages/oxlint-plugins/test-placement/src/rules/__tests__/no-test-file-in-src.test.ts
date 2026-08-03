import {
  SCHEMA_TEST_ACTUAL,
  SCHEMA_TEST_EXPECTED,
  SCHEMA_TEST_FIX,
  TEST_FILE_IN_SRC_ACTUAL,
  TEST_FILE_IN_SRC_EXPECTED,
  TEST_FILE_IN_SRC_FIX,
} from '../no-test-file-in-src.config.js'
import { noTestFileInSrc } from '../no-test-file-in-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const unsanctioned = (name: string) => [{
  messageId: 'testFileInSrc',
  data: {
    name,
    expected: TEST_FILE_IN_SRC_EXPECTED,
    actual: TEST_FILE_IN_SRC_ACTUAL,
    fix: TEST_FILE_IN_SRC_FIX,
  },
}]

const schemaTest = (name: string) => [{
  messageId: 'schemaTestInSrc',
  data: {
    name,
    expected: SCHEMA_TEST_EXPECTED,
    actual: SCHEMA_TEST_ACTUAL,
    fix: SCHEMA_TEST_FIX,
  },
}]

ruleTester.run('no-test-file-in-src', noTestFileInSrc, {
  valid: [
    {
      name: 'Should_Allow_PropertyTestInSrc_When_BesidesWorkflow',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_SchemaLawsEntryPoint_When_NamedExactly',
      code: '',
      filename: '/repo/pkg/src/schema-laws.test.ts',
    },
    {
      name: 'Should_Allow_NonTestFileInSrc_When_WorkflowSource',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.ts',
    },
    {
      name: 'Should_Allow_SchemaTestOutsideSrc_When_RuleInactive',
      code: '',
      filename: '/repo/pkg/tests/money.schema.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTestOutsideSrc_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/tests/confirm-order.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTestOutsideSrc_When_InDoubleUnderscoreTestsDir',
      code: '',
      filename: '/repo/pkg/__tests__/confirm-order.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SchemaTestInSrc_When_LawsAreGenerated',
      code: '',
      filename: '/repo/pkg/src/money.schema.test.ts',
      errors: schemaTest('money.schema.test.ts'),
    },
    {
      name: 'Should_Report_NestedSchemaTestInSrc_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/src/internal/__tests__/restart-decision.schema.test.ts',
      errors: schemaTest('restart-decision.schema.test.ts'),
    },
    {
      name: 'Should_Report_SchemaLawsSuffix_When_NotTheExactEntryPoint',
      code: '',
      filename: '/repo/pkg/src/money.schema-laws.test.ts',
      errors: unsanctioned('money.schema-laws.test.ts'),
    },
    {
      name: 'Should_Report_PlainTestInSrc_When_NotProperty',
      code: '',
      filename: '/repo/pkg/src/hook-timeout.test.ts',
      errors: unsanctioned('hook-timeout.test.ts'),
    },
    {
      name: 'Should_Report_SpecInSrc_When_NotProperty',
      code: '',
      filename: '/repo/pkg/src/foo.spec.ts',
      errors: unsanctioned('foo.spec.ts'),
    },
    {
      name: 'Should_Report_NestedTestInSrc_When_InsideDeeperDir',
      code: '',
      filename: '/repo/pkg/src/nested/a.test.ts',
      errors: unsanctioned('a.test.ts'),
    },
    {
      name: 'Should_Report_TestInSrcTestsDir_When_StillUnderSrc',
      code: '',
      filename: '/repo/pkg/src/__tests__/a.test.ts',
      errors: unsanctioned('a.test.ts'),
    },
  ],
})
