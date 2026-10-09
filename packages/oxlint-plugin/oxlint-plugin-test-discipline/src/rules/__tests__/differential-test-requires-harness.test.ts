import {
  RAW_FAST_CHECK_ACTUAL,
  RAW_FAST_CHECK_EXPECTED,
  RAW_FAST_CHECK_FIX,
} from '../differential-test-requires-harness.config.js'
import { differentialTestRequiresHarness } from '../differential-test-requires-harness.js'
import { createRuleTester, everywhere } from './_tester.js'

const ruleTester = createRuleTester()

const HP =
  'import { Differential, Metamorphic } from @systemfsoftware/differential-spec and express the test as Differential.compare({ name, reference, candidate }).on(arb).assert(oracle) or Metamorphic.on({ name, system }).relation({ transformInput, assertOutput }).on(arb)'

const rawFastCheckError = (method: string) => ({
  messageId: 'rawFastCheck' as const,
  data: {
    name: `raw fc.${method}(...) in a differential test file`,
    expected: RAW_FAST_CHECK_EXPECTED,
    actual: `fc.${method}(...) ${RAW_FAST_CHECK_ACTUAL}`,
    fix: RAW_FAST_CHECK_FIX,
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
      name: 'Should_LeaveTheRunnerToItsOwnRule_When_AnInvokedHarnessSitsBesideAPlainIt',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        import { it } from 'vitest'
        Differential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
        it('works', () => {})
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
      name: 'Should_Report_RawFastCheck_When_FcAssertRunsBesideTheHarness',
      code: `
        import { Differential } from '@systemfsoftware/differential-spec'
        import * as fc from 'fast-check'
        Differential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)
        fc.assert(prop)
      `,
      errors: [rawFastCheckError('assert')],
    }),
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
  ],
})
