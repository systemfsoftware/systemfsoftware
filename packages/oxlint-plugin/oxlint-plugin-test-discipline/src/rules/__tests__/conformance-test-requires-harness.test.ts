import { conformanceTestRequiresHarness } from '../conformance-test-requires-harness.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const HP =
  'import { Conformance } from @systemfsoftware/conformance-spec and express the test as Conformance.linearizable(implementation, { commands, model, run, fibers, operations }) in the scenario body'

const rawRunnerError = (name: string) => ({
  messageId: 'rawRunnerCall' as const,
  data: {
    name: `raw runner call (${name}) in a conformance test file`,
    expected: HP,
    actual: `${name}(...) bypasses the conformance check`,
    fix: `rewrite using ${HP}`,
  },
})

const runnerImportError = (source: string) => ({
  messageId: 'runnerImport' as const,
  data: {
    name: `runner import from ${source} in a conformance test file`,
    expected: HP,
    actual: 'a direct vitest / @effect/vitest runner import bypasses the conformance check',
    fix: `delete the runner import; ${HP}`,
  },
})

const missingImportError = {
  messageId: 'missingHarnessImport' as const,
  data: {
    name: 'conformance test file without the @systemfsoftware/conformance-spec import',
    expected: HP,
    actual: 'no conformance check import found',
    fix: HP,
  },
}

const missingUsageError = {
  messageId: 'missingHarnessUsage' as const,
  data: {
    name: 'conformance test file imports @systemfsoftware/conformance-spec but never invokes it',
    expected: HP,
    actual: 'no Conformance.linearizable, Conformance.sequential, or Conformance.released call runs',
    fix: HP,
  },
}

ruleTester.run('conformance-test-requires-harness', conformanceTestRequiresHarness, {
  valid: [
    {
      name: 'Should_Allow_LinearizableCall_When_ConformanceBarrelInvoked',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        Conformance.linearizable(lock, { commands: Commands, model, run, fibers: 2, operations: 4 })
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_SequentialCall_When_ConformanceBarrelInvoked',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        Conformance.sequential({ commands: Commands, model, run, fibers: 2, operations: 4 })
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_ReleasedCall_When_ConformanceBarrelInvoked',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        Conformance.released({ commands: Commands, model, run, fibers: 2, operations: 4 })
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_PlainTest_When_NotConformanceFile',
      code: `
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.integration.test.ts',
    },
    {
      name: 'Should_Allow_PlainTest_When_PropertyFile',
      code: `
        import { it } from '@effect/vitest'
        it.prop('works', [arb], ([x]) => x === x)
      `,
      filename: '/repo/pkg/src/a.workflow.property.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_LegacyCheckAndRunnerImport_When_LinearizableCheckUsed',
      code: `
        import { Linearizable } from '@systemfsoftware/conformance-spec'
        import { it } from 'vitest'
        it('works', () => {})
        Linearizable.check(lock, spec)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [
        runnerImportError('vitest'),
        rawRunnerError('it'),
        {
          messageId: 'legacyHarnessCall' as const,
          data: {
            name: 'a .check(...) call in a conformance test file',
            expected: HP,
            actual: 'Linearizable.check is not a check the barrel exposes',
            fix: HP,
          },
        },
      ],
    },
    {
      name: 'Should_Report_LegacyCheck_When_SequentialModelCheckUsed',
      code: `
        import { SequentialModel } from '@systemfsoftware/conformance-spec'
        SequentialModel.check(lock, spec)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [
        {
          messageId: 'legacyHarnessCall' as const,
          data: {
            name: 'a .check(...) call in a conformance test file',
            expected: HP,
            actual: 'SequentialModel.check is not a check the barrel exposes',
            fix: HP,
          },
        },
      ],
    },
    {
      name: 'Should_Report_LegacyCheck_When_ReleasedCheckUsed',
      code: `
        import { Released } from '@systemfsoftware/conformance-spec'
        Released.check(lock, spec)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [
        {
          messageId: 'legacyHarnessCall' as const,
          data: {
            name: 'a .check(...) call in a conformance test file',
            expected: HP,
            actual: 'Released.check is not a check the barrel exposes',
            fix: HP,
          },
        },
      ],
    },
    {
      name: 'Should_Report_LegacyCheck_When_BareCheckImported',
      code: `
        import { check } from '@systemfsoftware/conformance-spec'
        check(lock, spec)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [
        {
          messageId: 'legacyHarnessCall' as const,
          data: {
            name: 'a .check(...) call in a conformance test file',
            expected: HP,
            actual: 'check is not a check the barrel exposes',
            fix: HP,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingUsage_When_ConformanceImportedButNeverInvoked',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        const harness = Conformance
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [missingUsageError],
    },
    {
      name: 'Should_Report_MissingUsage_When_ConformanceNamespaceMemberIsUnknown',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        Conformance.check(lock, spec)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [
        {
          messageId: 'legacyHarnessCall' as const,
          data: {
            name: 'a .check(...) call in a conformance test file',
            expected: HP,
            actual: 'Conformance.check is not a check the barrel exposes',
            fix: HP,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingImport_When_ConformanceTestIsEmpty',
      code: `
        const x = 1
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [missingImportError],
    },
  ],
})
