import { propertyTestLocationDetail, SCHEMA_TEST_DETAIL, testFileInSrcDetail } from '../no-test-file-in-src.config.js'
import { noTestFileInSrc } from '../no-test-file-in-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const DEFAULT_DIR = '__tests__'

const unsanctioned = (name: string, dir: string = DEFAULT_DIR) => [{
  messageId: 'testFileInSrc',
  data: { name, ...testFileInSrcDetail(dir) },
}]

const schemaTest = (name: string) => [{
  messageId: 'schemaTestInSrc',
  data: { name, ...SCHEMA_TEST_DETAIL },
}]

const propertyLocation = (name: string, dir: string = DEFAULT_DIR) => [{
  messageId: 'propertyTestOutsideTestsDir',
  data: { name, ...propertyTestLocationDetail(dir) },
}]

ruleTester.run('no-test-file-in-src', noTestFileInSrc, {
  valid: [
    {
      name: 'Should_Allow_PropertyTestInSrc_When_InsideNestedTestsDir',
      code: '',
      filename: '/repo/pkg/src/__tests__/confirm-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_PropertyTestInSrc_When_InsideDeeperNestedTestsDir',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_SchemaLawsEntryPoint_When_NamedExactly',
      code: '',
      filename: '/repo/pkg/src/schema-laws.test.ts',
    },
    {
      name: 'Should_Allow_SchemaRefutationsEntryPoint_When_NamedExactly',
      code: '',
      filename: '/repo/pkg/src/schema-refutations.test.ts',
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
    {
      name: 'Should_StaySilent_When_TestIsInConfiguredDir',
      code: '',
      filename: '/repo/pkg/src/order/spec/confirm-order.workflow.property.test.ts',
      options: [{ sanctionedDirs: ['spec'] }],
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
      name: 'Should_Report_FooTestInSrc_When_Arbitrary',
      code: '',
      filename: '/repo/pkg/src/foo.test.ts',
      errors: unsanctioned('foo.test.ts'),
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
    {
      name: 'Should_Report_PropertyTestInSrc_When_BesideItsSource',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.property.test.ts',
      errors: propertyLocation('confirm-order.workflow.property.test.ts'),
    },
    {
      name: 'Should_Report_PropertyTestInSrc_When_BesideSourceInDeeperDir',
      code: '',
      filename: '/repo/pkg/src/order/confirm-order.workflow.property.test.ts',
      errors: propertyLocation('confirm-order.workflow.property.test.ts'),
    },
    {
      name: 'Should_Report_When_WorkflowCarriesColocatedCharacterizationTest',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.workflow.test.ts',
      errors: unsanctioned('confirm-order.workflow.test.ts'),
    },
    {
      name: 'Should_Report_When_KernelCarriesColocatedCharacterizationTest',
      code: '',
      filename: '/repo/pkg/src/__tests__/backoff.kernel.test.ts',
      errors: unsanctioned('backoff.kernel.test.ts'),
    },
    {
      name: 'Should_Report_When_ColocatedTestCarriesMtsExtension',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.workflow.test.mts',
      errors: unsanctioned('confirm-order.workflow.test.mts'),
    },
    {
      name: 'Should_Report_When_WorkflowPropertyTestStemCarriesExtraPeriod',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/a.b.workflow.property.test.ts',
      errors: propertyLocation('a.b.workflow.property.test.ts'),
    },
    {
      name: 'Should_Report_When_ConfiguredDirReplacesTheDefault',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/place-order.workflow.property.test.ts',
      options: [{ sanctionedDirs: ['spec'] }],
      errors: propertyLocation('place-order.workflow.property.test.ts', 'spec'),
    },
    {
      name: 'Should_Report_When_DirIsAPrefixOfASanctionedDir',
      code: '',
      filename: '/repo/pkg/src/order/__test__/place-order.workflow.property.test.ts',
      errors: propertyLocation('place-order.workflow.property.test.ts'),
    },
    {
      name: 'Should_Report_When_ColocatedTestNamesNoCell',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/helpers.test.ts',
      errors: unsanctioned('helpers.test.ts'),
    },
    {
      name: 'Should_Report_When_ColocatedTestNamesAShellCell',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.executor.test.ts',
      errors: unsanctioned('confirm-order.executor.test.ts'),
    },
  ],
})
