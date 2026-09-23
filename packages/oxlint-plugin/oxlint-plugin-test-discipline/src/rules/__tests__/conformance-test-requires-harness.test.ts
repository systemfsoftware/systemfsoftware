import { conformanceTestRequiresHarness } from '../conformance-test-requires-harness.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const HP =
  'import a check from @systemfsoftware/conformance-spec and express the test as Linearizable.check({ implementation, commands, model, run, fibers, operations }) or the corresponding check from SequentialModel.ts or Released.ts'

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
    name: 'conformance test file without @systemfsoftware/conformance-spec import',
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
    actual: 'a check is imported but no Linearizable.check, SequentialModel.check, or Released.check call runs',
    fix: HP,
  },
}

ruleTester.run('conformance-test-requires-harness', conformanceTestRequiresHarness, {
  valid: [
    {
      name: 'Should_Allow_CheckCall_When_ConformanceTestInvokesBareImport',
      code: `
        import { check } from '@systemfsoftware/conformance-spec'
        check({ implementation: lock, commands: Commands, model, run, fibers: 2, operations: 4 })
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_CheckCall_When_ConformanceTestInvokesLinearizable',
      code: `
        import { Linearizable } from '@systemfsoftware/conformance-spec'
        Linearizable.check({ implementation: lock, commands: Commands, model, run, fibers: 2, operations: 4 })
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_PlainTest_When_NotConformanceFile',
      code: `
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
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
      name: 'Should_Report_RunnerImportAndRawCall_When_ConformanceTestUsesPlainIt',
      code: `
        import { Linearizable } from '@systemfsoftware/conformance-spec'
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [runnerImportError('vitest'), rawRunnerError('it')],
    },
    {
      name: 'Should_Report_RunnerImportAndRawCall_When_ConformanceTestUsesEffectVitest',
      code: `
        import { Linearizable } from '@systemfsoftware/conformance-spec'
        import { describe } from '@effect/vitest'
        describe('suite', () => {})
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [runnerImportError('@effect/vitest'), rawRunnerError('describe')],
    },
    {
      name: 'Should_Report_AllThree_When_NoHarnessImportAndRawRunner',
      code: `
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [runnerImportError('vitest'), missingImportError, rawRunnerError('it')],
    },
    {
      name: 'Should_Report_RawCallAndMissingImport_When_MemberRunnerWithGlobals',
      code: `
        it.effect('works', () => Effect.void)
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [rawRunnerError('it'), missingImportError],
    },
    {
      name: 'Should_Report_RunnerImport_When_RunnerAliased',
      code: `
        import { it as rawIt } from 'vitest'
        rawIt('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [runnerImportError('vitest'), missingImportError],
    },
    {
      name: 'Should_Report_MissingUsage_When_HarnessImportedButNeverInvoked',
      code: `
        import { Linearizable } from '@systemfsoftware/conformance-spec'
        const harness = Linearizable
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [missingUsageError],
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
