import plugin from '@systemfsoftware/oxlint-plugin-test-discipline'
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

/** Where one fixture is linted: every sanctioned lane word, a plain test name, a runner package, and under `src/`. */
const PLACES: ReadonlyArray<readonly [string, string]> = [
  ['NamedIntegration', '/repo/pkg/tests/x.integration.test.ts'],
  ['NamedConformance', '/repo/pkg/tests/x.conformance.test.ts'],
  ['NamedDifferential', '/repo/pkg/tests/x.differential.test.ts'],
  ['NamedTrace', '/repo/pkg/tests/x.trace.test.ts'],
  ['NamedPlainly', '/repo/pkg/tests/x.test.ts'],
  ['InRunnerPackage', '/repo/packages/runner/vitest/tests/x.integration.test.ts'],
  ['UnderSrc', '/repo/pkg/src/__tests__/x.workflow.property.test.ts'],
]

const everywhere = <C extends { readonly name: string }>(
  testCase: C,
): Array<C & { readonly filename: string }> =>
  PLACES.map(([place, filename]) => ({ ...testCase, name: `${testCase.name}_${place}`, filename }))

const SETTINGS_KEY = '@systemfsoftware/oxlint-plugin-test-discipline'
const RUNNER = '@systemfsoftware/effect-e2e/runner'
const GHERKIN = `import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n`
const E2E_ROLE = { [SETTINGS_KEY]: { role: 'e2e' } } as const
const RUNNER_ROLE = { [SETTINGS_KEY]: { role: 'vitest-runner' } } as const
const UNDECODABLE_ROLE = { [SETTINGS_KEY]: { role: 'nonsense' } } as const

const outsidePackage = { messageId: 'e2eOutsideE2ePackage' }
const integrationInPackage = { messageId: 'integrationInE2ePackage' }

ruleTester.run('e2e-tier-placement', plugin.rules['e2e-tier-placement'], {
  valid: [
    ...everywhere({
      name: 'Should_Pass_When_AnE2ePackageHoldsAnE2eLaneFile',
      code: `import { expect, test } from '${RUNNER}'\n`,
      settings: E2E_ROLE,
    }),
    ...everywhere({
      name: 'Should_Pass_When_OnlyTheComposingApiOfTheRunnerIsImported',
      code: `import { makeGlobalSetup, makeRunner, RUN_OUTPUT_KEY } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_OnlyExpectIsImportedFromTheRunner',
      code: `import { expect } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_OnlyDescribeIsImportedFromTheRunner',
      code: `import { describe } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_OnlyAHookIsImportedFromTheRunner',
      code: `import { beforeAll } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_TheRunnerImportIsTypeOnlyInTheDeclaration',
      code: `import type { E2ETest, RunnerOptions } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_TheRunnerImportIsTypeOnlyInTheSpecifier',
      code: `import { type RunnerOptions } from '${RUNNER}'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_TestIsImportedFromVitest',
      code: `import { test } from 'vitest'\n`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_AnIntegrationTestIsInAPackageWithNoRole',
      code: GHERKIN,
    }),
    ...everywhere({
      name: 'Should_Pass_When_AnE2ePackageHoldsATestThatAlsoImportsTheRunnerTest',
      code: `${GHERKIN}import { test } from '${RUNNER}'\n`,
      settings: E2E_ROLE,
    }),
    {
      name: 'Should_Pass_When_AnAdmittedE2eFileIsInAnE2ePackage',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/x.e2e.ts',
      settings: E2E_ROLE,
    },
    {
      name: 'Should_Pass_When_TheRunnerDoesNotCollectTheFile_FixturesDirectlyUnderTests',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/__fixtures__/x.e2e.ts',
    },
    {
      name: 'Should_Pass_When_TheRunnerDoesNotCollectTheFile_ASuiteTemplateUnderFixtures',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/__fixtures__/suite/tests/x.e2e.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsUnderSrcAndSoNotATest',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/src/x.e2e.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsOutsideTestsAndSoNotATest',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/helpers/x.e2e.ts',
    },
    {
      name: 'Should_Pass_When_AnAdmittedE2eFileImportsOnlyExpectFromTheRunner',
      code: `import { expect } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/x.e2e.ts',
    },
  ],
  invalid: [
    ...everywhere({
      name: 'Should_ReportOutsideE2ePackage_When_AKnownBadE2eLaneFileIsInAPackageWithNoRole',
      code: `import { expect, test } from '${RUNNER}'\n`,
      errors: [outsidePackage],
    }),
    ...everywhere({
      name: 'Should_ReportOutsideE2ePackage_When_TheRunnerTestIsImportedUnderAnAlias',
      code: `import { test as it } from '${RUNNER}'\n`,
      errors: [outsidePackage],
    }),
    ...everywhere({
      name: 'Should_ReportOutsideE2ePackage_When_TheRunnerIsImportedAsANamespace',
      code: `import * as E2E from '${RUNNER}'\n`,
      errors: [outsidePackage],
    }),
    ...everywhere({
      name: 'Should_ReportIntegrationInE2ePackage_When_AGherkinOnlyTestIsInAnE2ePackage',
      code: GHERKIN,
      settings: E2E_ROLE,
      errors: [integrationInPackage],
    }),
    ...everywhere({
      name: 'Should_ReportIntegrationInE2ePackage_When_AGherkinTestOnlyImportsExpectFromTheRunner',
      code: `${GHERKIN}import { expect } from '${RUNNER}'\n`,
      settings: E2E_ROLE,
      errors: [integrationInPackage],
    }),
    ...everywhere({
      name: 'Should_ReportOutsideE2ePackage_When_TheDeclaredRoleIsTheVitestRunnerRole',
      code: `import { test } from '${RUNNER}'\n`,
      settings: RUNNER_ROLE,
      errors: [outsidePackage],
    }),
    ...everywhere({
      name: 'Should_ReportOutsideE2ePackage_When_TheDeclaredRoleDoesNotDecode',
      code: `import { test } from '${RUNNER}'\n`,
      settings: UNDECODABLE_ROLE,
      errors: [outsidePackage],
    }),
    {
      name: 'Should_ReportOutsideE2ePackage_When_AnAdmittedE2eFileIsInAPackageWithNoRole',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/x.e2e.ts',
      errors: [outsidePackage],
    },
    {
      name: 'Should_ReportOutsideE2ePackage_When_TheRunnerCollectsAFileUnderANestedFixturesDir',
      code: `import { test } from '${RUNNER}'\n`,
      filename: '/repo/pkg/tests/nested/__fixtures__/x.e2e.ts',
      errors: [outsidePackage],
    },
  ],
})
