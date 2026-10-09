import {
  LANE_MISMATCH_ACTUAL,
  LANE_MISMATCH_FIX,
  NO_LANE_ACTUAL,
  NO_LANE_EXPECTED,
  NO_LANE_FIX,
  PROPERTY_OUTSIDE_SRC_ACTUAL,
  PROPERTY_OUTSIDE_SRC_EXPECTED,
  PROPERTY_OUTSIDE_SRC_FIX,
} from '../test-suffix-outside-src.config.js'
import { testSuffixOutsideSrc } from '../test-suffix-outside-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const GHERKIN = `import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n`
const CONFORMANCE = `import { Conformance } from '@systemfsoftware/conformance-spec'\n`
const DIFFERENTIAL = `import { Differential } from '@systemfsoftware/differential-spec'\n`
const TRACE = `import { Rel, Suite } from '@systemfsoftware/trace-spec'\n`
const FAST_CHECK = `import * as fc from 'fast-check'\n`
const FORK_ONLY = `import { describe, it } from '@systemfsoftware/vitest'\n`

const laneMismatch = (name: string, expected: string) => ({
  messageId: 'laneMismatch' as const,
  data: { name, expected, actual: LANE_MISMATCH_ACTUAL, fix: LANE_MISMATCH_FIX },
})

const noLane = (name: string) => ({
  messageId: 'noLane' as const,
  data: { name, expected: NO_LANE_EXPECTED, actual: NO_LANE_ACTUAL, fix: NO_LANE_FIX },
})

const propertyOutsideSrc = (name: string) => ({
  messageId: 'propertyOutsideSrc' as const,
  data: {
    name,
    expected: PROPERTY_OUTSIDE_SRC_EXPECTED,
    actual: PROPERTY_OUTSIDE_SRC_ACTUAL,
    fix: PROPERTY_OUTSIDE_SRC_FIX,
  },
})

ruleTester.run('test-suffix-outside-src', testSuffixOutsideSrc, {
  valid: [
    {
      name: 'Should_Allow_IntegrationName_When_TheTestImportsOnlyTheGherkinHarness',
      code: GHERKIN,
      filename: '/repo/pkg/tests/a.integration.test.ts',
    },
    {
      name: 'Should_Allow_ConformanceName_When_TheTestImportsConformanceAndGherkin',
      code: `${CONFORMANCE}${GHERKIN}`,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_DifferentialName_When_TheDifferentialTestImportsFastCheck',
      code: `${DIFFERENTIAL}${FAST_CHECK}`,
      filename: '/repo/pkg/tests/a.differential.test.ts',
    },
    {
      name: 'Should_Allow_TraceName_When_TheTestImportsTraceSpec',
      code: TRACE,
      filename: '/repo/pkg/tests/a.trace.test.ts',
    },
    {
      name: 'Should_ReadOnlyTheLastWord_When_AnEarlierSegmentNamesAnotherLane',
      code: GHERKIN,
      filename: '/repo/pkg/tests/failure-corpus.trace.integration.test.ts',
    },
    {
      name: 'Should_Allow_ConformanceName_When_TheTestImportsTwoSpecificHarnesses',
      code: `${CONFORMANCE}${DIFFERENTIAL}`,
      filename: '/repo/pkg/tests/a.conformance.test.ts',
    },
    {
      name: 'Should_Allow_DifferentialName_When_TheTestImportsTwoSpecificHarnesses',
      code: `${CONFORMANCE}${DIFFERENTIAL}`,
      filename: '/repo/pkg/tests/a.differential.test.ts',
    },
    {
      name: 'Should_Allow_AModule_When_ItIsNotATest',
      code: FORK_ONLY,
      filename: '/repo/pkg/lib/helper.ts',
    },
    {
      name: 'Should_LeaveATestUnderSrcToThePlacementRule_When_ItSelectsNoLane',
      code: FORK_ONLY,
      filename: '/repo/pkg/src/a.test.ts',
    },
    {
      name: 'Should_Allow_ARunnerTest_When_ARunnerPackageDrivesVitestDirectly',
      code: FORK_ONLY,
      filename: '/repo/packages/vitest/tests/runner.test.ts',
    },
    {
      name: 'Should_Allow_AProbeFixture_When_ARunnerPackageHoldsNestedRunProbes',
      code: FORK_ONLY,
      filename: '/repo/packages/vitest-conformance/tests/__fixtures__/probes/expect/allowed.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_NameTheTraceSuffix_When_ATraceTestIsNamedIntegration',
      code: `${TRACE}${GHERKIN}`,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [laneMismatch('x.integration.test.ts', '.trace.test.ts')],
    },
    {
      name: 'Should_NameTheDifferentialSuffix_When_ADifferentialTestIsNamedIntegration',
      code: DIFFERENTIAL,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [laneMismatch('x.integration.test.ts', '.differential.test.ts')],
    },
    {
      name: 'Should_NameTheConformanceSuffix_When_AConformanceAndGherkinTestIsNamedIntegration',
      code: `${CONFORMANCE}${GHERKIN}`,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [laneMismatch('x.integration.test.ts', '.conformance.test.ts')],
    },
    {
      name: 'Should_NameTheTraceSuffix_When_ATraceWordIsOnlyADomainSegment',
      code: `${TRACE}${GHERKIN}`,
      filename: '/repo/pkg/tests/x.trace.integration.test.ts',
      errors: [laneMismatch('x.trace.integration.test.ts', '.trace.test.ts')],
    },
    {
      name: 'Should_NameEitherSpecificSuffix_When_ATwoHarnessTestIsNamedIntegration',
      code: `${CONFORMANCE}${DIFFERENTIAL}`,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [laneMismatch('x.integration.test.ts', '.conformance.test.ts or .differential.test.ts')],
    },
    {
      name: 'Should_NameTheIntegrationSuffix_When_AGherkinTestIsNamedConformance',
      code: GHERKIN,
      filename: '/repo/pkg/tests/x.conformance.test.ts',
      errors: [laneMismatch('x.conformance.test.ts', '.integration.test.ts')],
    },
    {
      name: 'Should_NameTheIntegrationSuffix_When_AGherkinTestUsesARetiredWord',
      code: GHERKIN,
      filename: '/repo/pkg/tests/x.feature.test.ts',
      errors: [laneMismatch('x.feature.test.ts', '.integration.test.ts')],
    },
    {
      name: 'Should_NameTheIntegrationSuffix_When_AGherkinTestIsASpecFile',
      code: GHERKIN,
      filename: '/repo/pkg/tests/x.spec.ts',
      errors: [laneMismatch('x.spec.ts', '.integration.test.ts')],
    },
    {
      name: 'Should_NameTheIntegrationSuffix_When_AGherkinTestIsTsx',
      code: GHERKIN,
      filename: '/repo/pkg/tests/x.integration.test.tsx',
      errors: [laneMismatch('x.integration.test.tsx', '.integration.test.ts')],
    },
    {
      name: 'Should_ReportNoLane_When_AnIntegrationNamedTestImportsOnlyTheFork',
      code: FORK_ONLY,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [noLane('x.integration.test.ts')],
    },
    {
      name: 'Should_ReportNoLane_When_AConformanceNamedTestImportsOnlyItsTypes',
      code: `import type { Conformance } from '@systemfsoftware/conformance-spec'\n${FORK_ONLY}`,
      filename: '/repo/pkg/tests/x.conformance.test.ts',
      errors: [noLane('x.conformance.test.ts')],
    },
    {
      name: 'Should_ReportNoLane_When_ABareTestLivesInATestsTree',
      code: FORK_ONLY,
      filename: '/repo/pkg/__tests__/x.test.ts',
      errors: [noLane('x.test.ts')],
    },
    {
      name: 'Should_ReportPropertyOutsideSrc_When_TheOnlyLaneIsFastCheck',
      code: FAST_CHECK,
      filename: '/repo/pkg/tests/x.property.test.ts',
      errors: [propertyOutsideSrc('x.property.test.ts')],
    },
    {
      name: 'Should_ReportPropertyOutsideSrc_When_TheOnlyLaneIsAnItPropCall',
      code: `${FORK_ONLY}it.prop('p', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => v === v)`,
      filename: '/repo/pkg/tests/x.integration.test.ts',
      errors: [propertyOutsideSrc('x.integration.test.ts')],
    },
  ],
})
