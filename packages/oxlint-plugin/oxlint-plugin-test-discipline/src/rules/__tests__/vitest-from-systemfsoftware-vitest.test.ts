import { HARNESS_PRESCRIPTION as CONFORMANCE } from '../conformance-test-requires-harness.config.js'
import { HARNESS_PRESCRIPTION as DIFFERENTIAL } from '../differential-test-requires-harness.config.js'
import { SETTINGS_KEY } from '../lane.js'
import {
  PRESCRIPTIONS,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from '../vitest-from-systemfsoftware-vitest.config.js'
import { vitestFromSystemfsoftwareVitest } from '../vitest-from-systemfsoftware-vitest.js'
import { createRuleTester, everywhere } from './_tester.js'

const ruleTester = createRuleTester()

const EXPECTED_DATA = {
  name: VIOLATION_NAME,
  expected: VIOLATION_EXPECTED,
  actual: VIOLATION_ACTUAL,
  fix: VIOLATION_FIX,
}

const refusal = { messageId: 'vitestImport', data: EXPECTED_DATA } as const

const RUNNER_ROLE = { [SETTINGS_KEY]: { role: 'vitest-runner' } } as const

const GHERKIN = "import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n"

const TRACE = "import { TraceSpec } from '@systemfsoftware/trace-spec'\n"

const runnerImport = (runner: string, source: string, lane: 'behaviour' | 'conformance' | 'differential') => ({
  messageId: 'runnerImport' as const,
  data: {
    name: `${runner} imported from ${source} in a ${lane} test`,
    expected: PRESCRIPTIONS[lane],
    actual: `a runner imported from a runner package bypasses the ${lane} harness`,
    fix: `delete the runner import; ${PRESCRIPTIONS[lane]}`,
  },
})

const rawRunnerCall = (runner: string, lane: 'conformance' | 'differential', prescription: string) => ({
  messageId: 'rawRunnerCall' as const,
  data: {
    name: `raw runner call (${runner}) in a ${lane} test`,
    expected: prescription,
    actual: `${runner}(...) bypasses the ${lane} harness`,
    fix: `rewrite using ${prescription}`,
  },
})

ruleTester.run('vitest-from-systemfsoftware-vitest', vitestFromSystemfsoftwareVitest, {
  valid: [
    {
      name: 'Should_Allow_ValueImports_When_SourceIsSystemfsoftwareVitest',
      code: `import { describe, expect, it, vi } from '@systemfsoftware/vitest'`,
    },
    {
      name: 'Should_Allow_NamespaceImport_When_SourceIsSystemfsoftwareVitest',
      code: `import * as vitest from '@systemfsoftware/vitest'`,
    },
    {
      name: 'Should_Allow_DynamicImport_When_SourceIsSystemfsoftwareVitest',
      code: `const vitest = await import('@systemfsoftware/vitest')`,
    },
    {
      name: 'Should_Allow_TypeOnlyDeclaration_When_SourceIsVitest',
      code: `import type { TestOptions, Vitest } from 'vitest'`,
    },
    {
      name: 'Should_Allow_InlineTypeSpecifiers_When_SourceIsVitest',
      code: `import { type TestOptions, type Vitest } from 'vitest'`,
    },
    {
      name: 'Should_Allow_TypeOnlyNamespace_When_SourceIsVitest',
      code: `import type * as V from 'vitest'`,
    },
    {
      name: 'Should_Allow_TypeOnlyDefault_When_SourceIsVitest',
      code: `import type Vitest from 'vitest'`,
    },
    {
      name: 'Should_Allow_ValueImport_When_SourceIsNotVitest',
      code: `import { expect } from './expect.js'`,
    },
    {
      name: 'Should_Allow_DynamicImport_When_SourceIsNotVitest',
      code: `const mod = await import('vitest-something')`,
    },
    ...everywhere({
      name: 'Should_Allow_ARawVitestImport_When_ThePackageDeclaresTheRunnerRole',
      code: `import { describe, expect, it } from 'vitest'`,
      settings: RUNNER_ROLE,
    }),
    {
      name: 'Should_Allow_TheForkReExportingVitest_When_ItDeclaresTheRunnerRole',
      code: `import * as V from 'vitest'\nexport * from 'vitest'`,
      filename: '/repo/packages/vitest/src/mod.ts',
      settings: RUNNER_ROLE,
    },
    {
      name: 'Should_TakeTheRoleAtItsWord_When_AFixturePackageDeclaresIt',
      code: `import { expect } from 'vitest'`,
      filename: '/repo/packages/fixtures/tests/x.test.ts',
      settings: RUNNER_ROLE,
    },
    {
      name: 'Should_Allow_TypeReExport_When_SourceIsUpstreamEffectVitest',
      code: `export type { TestAPI } from '@effect/vitest'`,
    },
    {
      name: 'Should_Allow_ReExport_When_SourceIsSystemfsoftwareVitest',
      code: `export * from '@systemfsoftware/vitest'`,
    },
    ...everywhere({
      name: 'Should_Allow_TheGherkinIt_When_ABehaviourTestCallsIt',
      code: `${GHERKIN}const Feature = makeFeature({ it, layer })\nit('x', () => {})`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerFromSystemfsoftwareVitest_When_NoHarnessIsImported',
      code: `import { describe, it } from '@systemfsoftware/vitest'\ndescribe('x', () => { it('y', () => {}) })`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerFromSystemfsoftwareVitest_When_ATraceTestImportsAndCallsIt',
      code:
        `${TRACE}import { describe, it } from '@systemfsoftware/vitest'\ndescribe('x', () => { it('y', () => {}) })`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerTypeDeclaration_When_ABehaviourTestImportsItFromSystemfsoftwareVitest',
      code:
        `${GHERKIN}import type { describe } from '@systemfsoftware/vitest'\nconst Feature = makeFeature({ it, layer })`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerTypeDeclaration_When_AConformanceTestImportsItFromVitest',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nimport type { it, test } from 'vitest'\nConformance.sequential(impl, spec)`,
    }),
    ...everywhere({
      name: 'Should_Allow_AnAssertionImport_When_ADifferentialTestImportsExpect',
      code:
        `import { Differential } from '@systemfsoftware/differential-spec'\nimport { expect } from '@systemfsoftware/vitest'\nDifferential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => expect(x).toBe(y))`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerTypeImport_When_AConformanceTestImportsIt',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { type it } from '@systemfsoftware/vitest'\nConformance.sequential(impl, spec)`,
    }),
    ...everywhere({
      name: 'Should_Allow_ARunnerCall_When_TheConformanceHarnessImportIsTypeOnly',
      code:
        `import type { Conformance } from '@systemfsoftware/conformance-spec'\nimport { it } from '@systemfsoftware/vitest'\nit('x', () => {})`,
    }),
  ],
  invalid: [
    {
      name: 'Should_Report_NamedImport_When_SourceIsVitest',
      code: `import { vi } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_AliasedNamedImport_When_SourceIsVitest',
      code: `import { expect as e } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_RunnerImport_When_SourceIsVitest',
      code: `import { describe, it } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DefaultImport_When_SourceIsVitest',
      code: `import Vitest from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_NamespaceImport_When_SourceIsVitest',
      code: `import * as Vitest from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_SideEffectImport_When_SourceIsVitest',
      code: `import 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_EmptyNamedImport_When_SourceIsVitest',
      code: `import {} from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_MixedImport_When_ItCarriesAValueSpecifier',
      code: `import { vi, type Vitest } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DynamicImport_When_SourceIsVitest',
      code: `const Vitest = await import('vitest')`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_ValueImport_When_TheFileIsNamedLikeASetupFile',
      code: `import { afterEach } from 'vitest'`,
      filename: '/repo/packages/atom/effect-atom-react/vitest-setup.ts',
      errors: [refusal],
    },
    {
      name: 'Should_Report_RunnerImport_When_SourceIsUpstreamEffectVitest',
      code: `import { it } from '@effect/vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_NamespaceImport_When_SourceIsUpstreamEffectVitest',
      code: `import * as V from '@effect/vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DynamicImport_When_SourceIsUpstreamEffectVitest',
      code: `const V = await import('@effect/vitest')`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_StarReExport_When_SourceIsUpstreamEffectVitest',
      code: `export * from '@effect/vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_NamedReExport_When_SourceIsVitest',
      code: `export { it } from 'vitest'`,
      errors: [refusal],
    },
    ...everywhere({
      name: 'Should_Report_RunnerImport_When_ABehaviourTestImportsTestFromSystemfsoftwareVitest',
      code: `${GHERKIN}import { test } from '@systemfsoftware/vitest'\nconst Feature = makeFeature({ it, layer })`,
      errors: [runnerImport('test', '@systemfsoftware/vitest', 'behaviour')],
    }),
    {
      name: 'Should_Report_RunnerAndVitestImport_When_ABehaviourTestImportsDescribeFromVitest',
      code: `${GHERKIN}import { describe, expect } from 'vitest'\nconst Feature = makeFeature({ it, layer })`,
      filename: '/repo/pkg/tests/x.test.ts',
      errors: [refusal, runnerImport('describe', 'vitest', 'behaviour')],
    },
    ...everywhere({
      name: 'Should_ReportOnlyTheRunner_When_ADifferentialTestImportsItAloneFromEffectVitest',
      code:
        `import { Differential } from '@systemfsoftware/differential-spec'\nimport { it } from '@effect/vitest'\nDifferential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)\nit('x', () => {})`,
      errors: [runnerImport('it', '@effect/vitest', 'differential')],
    }),
    ...everywhere({
      name: 'Should_ReportOnlyTheRunner_When_AConformanceTestImportsItAloneFromVitest',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { it } from 'vitest'\nConformance.sequential(impl, spec)`,
      errors: [runnerImport('it', 'vitest', 'conformance')],
    }),
    ...everywhere({
      name: 'Should_ReportOneFinding_When_ABehaviourTestCallsAnItImportedFromSystemfsoftwareVitest',
      code: `${
        GHERKIN.replace('it, ', '')
      }import { it } from '@systemfsoftware/vitest'\nconst Feature = makeFeature({ it, layer })\nit('x', () => {})`,
      errors: [runnerImport('it', '@systemfsoftware/vitest', 'behaviour')],
    }),
    ...everywhere({
      name: 'Should_Report_RawRunnerCall_When_ADifferentialTestCallsAnUnimportedDescribe',
      code:
        `import { Differential } from '@systemfsoftware/differential-spec'\nDifferential.compare({ name, reference: a, candidate: b }).on(arb).assert((x, y) => x === y)\ndescribe('suite', () => {})`,
      errors: [rawRunnerCall('describe', 'differential', DIFFERENTIAL)],
    }),
    ...everywhere({
      name: 'Should_Report_RawRunnerCall_When_AConformanceTestCallsItEffect',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nConformance.sequential(impl, spec)\nit.effect('x', () => Effect.void)`,
      errors: [rawRunnerCall('it', 'conformance', CONFORMANCE)],
    }),
    ...everywhere({
      name: 'Should_ReportOnceUnderConformance_When_ATestImportsBothConformanceAndDifferentialHarnesses',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Differential } from '@systemfsoftware/differential-spec'\nit('works', () => {})`,
      errors: [rawRunnerCall('it', 'conformance', CONFORMANCE)],
    }),
    ...everywhere({
      name: 'Should_Report_RawRunnerCall_When_ADifferentialTestCallsTheGherkinIt',
      code:
        `import { Differential } from '@systemfsoftware/differential-spec'\nimport { it } from '@systemfsoftware/effect-gherkin-spec'\nit('x', () => {})`,
      errors: [rawRunnerCall('it', 'differential', DIFFERENTIAL)],
    }),
    {
      name: 'Should_Refuse_TheForksRawImport_When_ANonRunnerPackageCopiesIt',
      code: `import * as V from 'vitest'\nexport * from 'vitest'`,
      filename: '/repo/packages/vitest/src/mod.ts',
      errors: [refusal, refusal],
    },
    ...everywhere({
      name: 'Should_Refuse_ARawExpectImport_When_ThePackageDeclaresNoRole',
      code: `import { expect } from 'vitest'`,
      errors: [refusal],
    }),
    ...everywhere({
      name: 'Should_RefuseOnlyTheForeignImport_When_ATraceTestImportsItFromVitest',
      code: `${TRACE}import { it } from 'vitest'\nit('x', () => {})`,
      errors: [refusal],
    }),
    ...everywhere({
      name: 'Should_StillReportTheHarnessRunner_When_ARunnerRolePackageImportsItInAConformanceTest',
      code:
        `import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { it } from 'vitest'\nConformance.sequential(impl, spec)`,
      settings: RUNNER_ROLE,
      errors: [runnerImport('it', 'vitest', 'conformance')],
    }),
  ],
})
