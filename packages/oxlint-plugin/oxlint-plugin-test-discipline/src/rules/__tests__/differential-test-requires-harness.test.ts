import { differentialTestRequiresHarness } from '../differential-test-requires-harness.js'
import { createRuleTester, everywhere } from './_tester.js'

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
    actual: 'a direct vitest / @effect/vitest / @systemfsoftware/vitest runner import bypasses the differential oracle',
    fix: `delete the runner import; ${HP}`,
  },
})

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
    ...everywhere({
      name: 'Should_Allow_HarnessBuilder_When_DifferentialTestInvokesBareImport',
      code: `
        import { compare } from '@systemfsoftware/differential-spec'
        compare({ reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
      `,
    }),
    {
      name: 'Should_Allow_HarnessBuilder_When_ImportedFromAHarnessSubpath',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec/compare'
        Differential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
      `,
      filename: '/repo/pkg/tests/a.integration.test.ts',
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
    ...everywhere({
      name: 'Should_Allow_PlainTest_When_NoDifferentialHarnessImported',
      code: `
        import { it } from 'vitest'
        it('works', () => {})
      `,
    }),
    ...everywhere({
      name: 'Should_Allow_PropertyTest_When_NoDifferentialHarnessImported',
      code: `
        import { it } from '@systemfsoftware/vitest'
        it.prop('works', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => v === v)
      `,
    }),
    ...everywhere({
      name: 'Should_Allow_PlainTest_When_TheHarnessImportIsTypeOnly',
      code: `
        import type { Differential } from '@systemfsoftware/differential-spec'
        import { it } from 'vitest'
        it('works', () => {})
      `,
    }),
  ],
  invalid: [
    ...everywhere({
      name: 'Should_Report_RunnerImportAndRawCall_When_DifferentialTestUsesPlainIt',
      code: `
        import { compare } from '@systemfsoftware/differential-spec'
        import { it } from 'vitest'
        it('works', () => {})
      `,
      errors: [runnerImportError('vitest'), rawRunnerError('it')],
    }),
    {
      name: 'Should_Report_RawCall_When_TheFileAlsoImportsTheConformanceHarness',
      code: `
        import { Conformance } from '@systemfsoftware/conformance-spec'
        import { Differential } from '@systemfsoftware/differential-spec'
        it('works', () => {})
      `,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
      errors: [rawRunnerError('it')],
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
    ...everywhere({
      name: 'Should_Report_MissingUsage_When_HarnessImportedButNeverInvoked',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        const harness = Differential
      `,
      errors: [missingUsageError],
    }),
    {
      name: 'Should_Report_MissingUsage_When_TheHarnessIsOnlyImportedForItsSideEffects',
      code: `
        import '@systemfsoftware/differential-spec'
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [missingUsageError],
    },
    {
      name: 'Should_Report_RunnerImport_When_ForkRunnerImportedInDifferentialFile',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        import { it } from '@systemfsoftware/vitest'
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('@systemfsoftware/vitest')],
    },
    {
      name: 'Should_Report_RunnerImport_When_UpstreamEffectVitestImportedInDifferentialFile',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        import { it } from '@effect/vitest'
      `,
      filename: '/repo/pkg/tests/a.differential.test.ts',
      errors: [runnerImportError('@effect/vitest')],
    },
  ],
})
