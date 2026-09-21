import {
  MISSING_CELL_TEST_ACTUAL,
  MISSING_CELL_TEST_EXPECTED,
  MISSING_CELL_TEST_FIX,
  UNSANCTIONED_CELL_ACTUAL,
  UNSANCTIONED_CELL_EXPECTED,
  UNSANCTIONED_CELL_FIX,
} from '../src-property-test-cell.config.js'
import { srcPropertyTestCell } from '../src-property-test-cell.js'
import { createRuleTester } from './_tester.js'

const IN_SOURCE_BLOCK = `export const decide = (n: number) => n > 0

if (import.meta.vitest) {
  const { expect, it } = import.meta.vitest
  it('decides', () => {
    expect(decide(1)).toBe(true)
  })
}
`

const ruleTester = createRuleTester()

ruleTester.run('src-property-test-cell', srcPropertyTestCell, {
  valid: [
    {
      name: 'Should_Allow_WorkflowPropertyTest_When_ColocatedInSrc',
      code: '',
      filename: '/repo/pkg/src/confirm-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_SchemaLawsEntryPoint_When_NotAPropertyTest',
      code: '',
      filename: '/repo/pkg/src/schema-laws.test.ts',
    },
    {
      name: 'Should_Allow_PropertyTestOutsideSrc_When_InTestsDir',
      code: '',
      filename: '/repo/pkg/tests/legacy.property.test.ts',
    },
    {
      name: 'Should_Allow_NonPropertyTestInSrc_When_RuleInactiveForNonProperty',
      code: '',
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_StaySilent_When_NoCellsAreDeclared',
      code: 'export const fold = (n: number) => n',
      filename: '/repo/pkg/src/backoff.kernel.ts',
    },
    {
      name: 'Should_StaySilent_When_CellIsNotInDeclaredList',
      code: 'export const decide = (n: number) => n',
      filename: '/repo/pkg/src/confirm-order.workflow.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
    },
    {
      name: 'Should_StaySilent_When_CellCarriesInSourceBlock',
      code: IN_SOURCE_BLOCK,
      filename: '/repo/pkg/src/backoff.kernel.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
    },
    {
      name: 'Should_StaySilent_When_TestFileSuffixCollidesWithADeclaredCell',
      code: '',
      filename: '/repo/pkg/src/__tests__/backoff.kernel.test.ts',
      options: [{ cellsRequiringTest: ['kernel', 'test'] }],
    },
    {
      name: 'Should_StaySilent_When_FileHasNoCellSuffix',
      code: 'export const helper = (n: number) => n',
      filename: '/repo/pkg/src/index.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
    },
    {
      name: 'Should_StaySilent_When_ADeclaredCellSitsBeforeTheTerminalSuffix',
      code: 'export const build = (n: number) => n',
      filename: '/repo/pkg/src/widget.kernel.ts.workflow.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ExecutorPropertyTest_When_NotSanctioned',
      code: '',
      filename: '/repo/pkg/src/confirm-order.executor.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'confirm-order.executor.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_AclPropertyTest_When_NotSanctioned',
      code: '',
      filename: '/repo/pkg/src/order.acl.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'order.acl.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_BareStemPropertyTest_When_NoCellSuffix',
      code: '',
      filename: '/repo/pkg/src/supervise-index.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'supervise-index.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_DeclaredCellHasNoColocatedTestAndNoInSourceBlock',
      code: 'export const fold = (n: number) => n',
      filename: '/repo/pkg/src/backoff.kernel.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
      errors: [{
        messageId: 'missingCellTest',
        data: {
          name: 'backoff.kernel.ts',
          expected: MISSING_CELL_TEST_EXPECTED,
          actual: MISSING_CELL_TEST_ACTUAL,
          fix: MISSING_CELL_TEST_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_DeclaredCellGuardsOnSomethingOtherThanImportMetaVitest',
      code: 'export const fold = (n: number) => n\n\nif (globalThis.vitest) {\n  fold(1)\n}\n',
      filename: '/repo/pkg/src/backoff.kernel.ts',
      options: [{ cellsRequiringTest: ['kernel'] }],
      errors: [{
        messageId: 'missingCellTest',
        data: {
          name: 'backoff.kernel.ts',
          expected: MISSING_CELL_TEST_EXPECTED,
          actual: MISSING_CELL_TEST_ACTUAL,
          fix: MISSING_CELL_TEST_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_DeclaredCellCarriesMtsExtension',
      code: 'export const fold = (n: number) => n',
      filename: '/repo/pkg/src/backoff.kernel.mts',
      options: [{ cellsRequiringTest: ['kernel'] }],
      errors: [{
        messageId: 'missingCellTest',
        data: {
          name: 'backoff.kernel.mts',
          expected: MISSING_CELL_TEST_EXPECTED,
          actual: MISSING_CELL_TEST_ACTUAL,
          fix: MISSING_CELL_TEST_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_PolicyPropertyTest_When_NotSanctioned',
      code: '',
      filename: '/repo/pkg/src/retry.policy.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'retry.policy.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SchemaPropertyTest_When_NotSanctioned',
      code: '',
      filename: '/repo/pkg/src/money.schema.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'money.schema.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelPropertyTest_When_NotSanctioned',
      code: '',
      filename: '/repo/pkg/src/backoff.kernel.property.test.ts',
      errors: [{
        messageId: 'unsanctionedCell',
        data: {
          name: 'backoff.kernel.property.test.ts',
          expected: UNSANCTIONED_CELL_EXPECTED,
          actual: UNSANCTIONED_CELL_ACTUAL,
          fix: UNSANCTIONED_CELL_FIX,
        },
      }],
    },
  ],
})
