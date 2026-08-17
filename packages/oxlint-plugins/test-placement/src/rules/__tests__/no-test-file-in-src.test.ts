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
      name: 'Should_Allow_PlainStemTest_When_AdmitPlainStemsOptionIsSet',
      code: '',
      filename: '/repo/pkg/src/wait/__tests__/verdict.test.ts',
      options: [{ admitPlainStems: true }],
    },
    {
      name: 'Should_StaySilent_When_TestIsInConfiguredDir',
      code: '',
      filename: '/repo/pkg/src/order/spec/confirm-order.workflow.property.test.ts',
      options: [{ sanctionedDirs: ['spec'] }],
    },
    {
      name: 'Should_StaySilent_When_CellCarriesColocatedCharacterizationTest',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.workflow.test.ts',
    },
    {
      name: 'Should_StaySilent_When_KernelCarriesColocatedCharacterizationTest',
      code: '',
      filename: '/repo/pkg/src/__tests__/backoff.kernel.test.ts',
    },
    {
      name: 'Should_StaySilent_When_ColocatedTestCarriesMtsExtension',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.workflow.test.mts',
    },
    {
      name: 'Should_StaySilent_When_OnlyTheTerminalTestSuffixIsStripped',
      code: '',
      filename: '/repo/pkg/src/order/__tests__/confirm-order.spec.ts.workflow.test.ts',
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
      name: 'Should_Report_PlainStemTest_When_OptionIsUnset',
      code: '',
      filename: '/repo/pkg/src/wait/__tests__/verdict.test.ts',
      errors: unsanctioned('verdict.test.ts'),
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
      name: 'Should_NameDefaultDir_When_OptionOmitted',
      code: '',
      filename: '/repo/pkg/src/order/place-order.workflow.property.test.ts',
      errors: [{
        messageId: 'propertyTestOutsideTestsDir',
        data: {
          name: 'place-order.workflow.property.test.ts',
          expected:
            'src/**/__tests__/<name> — a property test one directory down from the cell it covers, never beside it',
          actual: 'a property test beside its source under src/, outside any __tests__ directory',
          fix:
            'move the file down one directory into __tests__: src/<path>/<name> -> src/<path>/__tests__/<name>. The suffix is already sanctioned; only the directory is wrong. Relative imports shift one level: ./<cell>.js -> ../<cell>.js',
        },
      }],
    },
    {
      name: 'Should_NameConfiguredDir_When_OptionSet',
      code: '',
      filename: '/repo/pkg/src/order/place-order.workflow.property.test.ts',
      options: [{ sanctionedDirs: ['spec'] }],
      errors: [{
        messageId: 'propertyTestOutsideTestsDir',
        data: {
          name: 'place-order.workflow.property.test.ts',
          expected: 'src/**/spec/<name> — a property test one directory down from the cell it covers, never beside it',
          actual: 'a property test beside its source under src/, outside any spec directory',
          fix:
            'move the file down one directory into spec: src/<path>/<name> -> src/<path>/spec/<name>. The suffix is already sanctioned; only the directory is wrong. Relative imports shift one level: ./<cell>.js -> ../<cell>.js',
        },
      }],
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
