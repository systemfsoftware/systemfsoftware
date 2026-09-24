import { differentialTestRequiresHarness } from '../differential-test-requires-harness.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const HP =
  'import { Differential, Metamorphic } from @systemfsoftware/differential-spec and express the test as Differential.compare({ name, reference, candidate }).on(arb).assert(oracle) or Metamorphic.on({ name, system }).relation({ transformInput, assertOutput }).on(arb)'

const rawRunnerError = (name: string) => ({
  messageId: 'rawRunnerCall' as const,
  data: {
    name: `raw runner call (${name}) in a differential test file`,
    expected: HP,
    actual: `${name}(...) bypasses the differential oracle`,
    fix: `rewrite using ${HP}`,
  },
})

const runnerImportError = (source: string) => ({
  messageId: 'runnerImport' as const,
  data: {
    name: `runner import from ${source} in a differential test file`,
    expected: HP,
    actual: 'a direct vitest / @effect/vitest runner import bypasses the differential oracle',
    fix: `delete the runner import; ${HP}`,
  },
})

const missingImportError = {
  messageId: 'missingHarnessImport' as const,
  data: {
    name: 'differential test file without @systemfsoftware/differential-spec import',
    expected: HP,
    actual: 'no differential harness import found',
    fix: HP,
  },
}

const missingUsageError = {
  messageId: 'missingHarnessUsage' as const,
  data: {
    name: 'differential test file imports @systemfsoftware/differential-spec but never invokes it',
    expected: HP,
    actual: 'the harness is imported but no Differential.compare or Metamorphic.on chain runs',
    fix: HP,
  },
}

ruleTester.run('differential-test-requires-harness', differentialTestRequiresHarness, {
  valid: [
    {
      name: 'Should_Allow_HarnessBuilder_When_DifferentialTestInvokesBareImport',
      code: `
        import { compare } from '@systemfsoftware/differential-spec'
        compare({ reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
    },
    {
      name: 'Should_Allow_HarnessBuilder_When_DifferentialTestInvokesNamespace',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        Differential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
    },
    {
      name: 'Should_Allow_HarnessBuilder_When_DifferentialTestInvokesMetamorphic',
      code: `
        import { Metamorphic } from '@systemfsoftware/differential-spec'
        Metamorphic.on({ name, system }).relation({ transformInput: t, assertOutput: r }).on(arb)
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
    },
    {
      name: 'Should_Allow_PlainTest_When_NotDifferentialFile',
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
      name: 'Should_Report_RunnerImportAndRawCall_When_DifferentialTestUsesPlainIt',
      code: `
        import { compare } from '@systemfsoftware/differential-spec'
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('vitest'), rawRunnerError('it')],
    },
    {
      name: 'Should_Report_RunnerImportAndRawCall_When_DifferentialTestUsesDescribe',
      code: `
        import { Metamorphic } from '@systemfsoftware/differential-spec'
        import { describe } from 'vitest'
        describe('suite', () => {})
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('vitest'), rawRunnerError('describe')],
    },
    {
      name: 'Should_Report_AllThree_When_NoHarnessImportAndRawRunner',
      code: `
        import { it } from 'vitest'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('vitest'), missingImportError, rawRunnerError('it')],
    },
    {
      name: 'Should_Report_RawCallAndMissingImport_When_MemberRunnerWithGlobals',
      code: `
        it.effect('works', () => Effect.void)
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [rawRunnerError('it'), missingImportError],
    },
    {
      name: 'Should_Report_RunnerImport_When_RunnerAliased',
      code: `
        import { it as rawIt } from 'vitest'
        rawIt('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('vitest'), missingImportError],
    },
    {
      name: 'Should_Report_MissingUsage_When_HarnessImportedButNeverInvoked',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        const harness = Differential
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [missingUsageError],
    },
    {
      name: 'Should_Report_MissingImport_When_DifferentialTestIsEmpty',
      code: `
        const x = 1
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [missingImportError],
    },
  ],
})
