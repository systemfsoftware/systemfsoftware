import { ACTUAL, EXPECTED, FIX } from '../harness-no-module-scope-registration.config.js'
import { harnessNoModuleScopeRegistration } from '../harness-no-module-scope-registration.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const registration = (name: string) => [{
  messageId: 'moduleScopeRegistration',
  data: {
    name,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
}]

ruleTester.run('harness-no-module-scope-registration', harnessNoModuleScopeRegistration, {
  valid: [
    {
      name: 'Should_Allow_Registration_When_InsideExportedFunction',
      code: "export function register() { RuleTester.run('rule', rule, { valid: [], invalid: [] }) }",
      filename: '/repo/pkg/src/a.harness.ts',
    },
    {
      name: 'Should_Allow_HarnessConstruction_When_AtModuleScope',
      code: 'export const harness = makeHarness()',
      filename: '/repo/pkg/src/a.harness.ts',
    },
    {
      name: 'Should_Allow_ConstructionCall_When_CalleeNotRegistered',
      code: "makeHarness('scenario', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
    },
    {
      name: 'Should_Allow_Observer_When_ModuleScopeRegistration',
      code: "describe('suite', () => {})",
      filename: '/repo/pkg/src/a.observer.ts',
    },
    {
      name: 'Should_Allow_Kernel_When_ModuleScopeRegistration',
      code: "it('case', () => {})",
      filename: '/repo/pkg/src/a.kernel.ts',
    },
    {
      name: 'Should_Allow_Registration_When_InsideImportMetaVitestBlock',
      code: `
        if (import.meta.vitest !== void 0) {
          describe('suite', () => {})
          it('case', () => {})
        }
      `,
      filename: '/repo/pkg/src/a.harness.ts',
    },
    {
      name: 'Should_Allow_Registration_When_CustomCalleesOptionOmitsIt',
      code: "describe('suite', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      options: [{ callees: ['RuleTester.run'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_RuleTesterRun_When_AtModuleScope',
      code: "RuleTester.run('rule', rule, { valid: [], invalid: [] })",
      filename: '/repo/pkg/src/a.harness.ts',
      errors: registration('RuleTester.run'),
    },
    {
      name: 'Should_Report_Describe_When_AtModuleScope',
      code: "describe('suite', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      errors: registration('describe'),
    },
    {
      name: 'Should_Report_It_When_AtModuleScope',
      code: "it('case', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      errors: registration('it'),
    },
    {
      name: 'Should_Report_Describe_When_PropertyOfDescribeAtModuleScope',
      code: "describe.skip('suite', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      errors: registration('describe.skip'),
    },
    {
      name: 'Should_Report_ItProp_When_AtModuleScope',
      code: "it.prop('case', [], () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      errors: registration('it.prop'),
    },
    {
      name: 'Should_Report_CustomCallee_When_CustomCalleesOptionCarriesIt',
      code: "registerSuite('suite', () => {})",
      filename: '/repo/pkg/src/a.harness.ts',
      options: [{ callees: ['RuleTester.run', 'registerSuite'] }],
      errors: registration('registerSuite'),
    },
  ],
})
