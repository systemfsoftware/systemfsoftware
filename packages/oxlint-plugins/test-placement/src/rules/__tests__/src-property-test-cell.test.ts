import {
  UNSANCTIONED_CELL_ACTUAL,
  UNSANCTIONED_CELL_EXPECTED,
  UNSANCTIONED_CELL_FIX,
} from '../src-property-test-cell.config.js'
import { srcPropertyTestCell } from '../src-property-test-cell.js'
import { createRuleTester } from './_tester.js'

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
      name: 'Should_Allow_PolicyPropertyTest_When_ColocatedInSrc',
      code: '',
      filename: '/repo/pkg/src/retry.policy.property.test.ts',
    },
    {
      name: 'Should_Allow_SchemaPropertyTest_When_StatingRefusals',
      code: '',
      filename: '/repo/pkg/src/money.schema.property.test.ts',
    },
    {
      name: 'Should_Allow_KernelPropertyTest_When_ColocatedInSrc',
      code: '',
      filename: '/repo/pkg/src/backoff.kernel.property.test.ts',
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
  ],
})
