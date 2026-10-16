import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

export const createRuleTester = (): RuleTester =>
  new RuleTester({
    languageOptions: {
      parserOptions: {
        lang: 'ts',
      },
    },
  })

/**
 * Where one fixture is linted: every sanctioned lane word, a plain test name,
 * a runner package's tests, and a test directory under `src/`.
 */
const PLACES: ReadonlyArray<readonly [string, string]> = [
  ['NamedIntegration', '/repo/pkg/tests/x.integration.test.ts'],
  ['NamedConformance', '/repo/pkg/tests/x.conformance.test.ts'],
  ['NamedDifferential', '/repo/pkg/tests/x.differential.test.ts'],
  ['NamedTrace', '/repo/pkg/tests/x.trace.test.ts'],
  ['NamedPlainly', '/repo/pkg/tests/x.test.ts'],
  ['InRunnerPackage', '/repo/packages/runner/vitest/tests/x.integration.test.ts'],
  ['UnderSrc', '/repo/pkg/src/__tests__/x.workflow.property.test.ts'],
]

/**
 * One fixture linted in every place, each copy expecting the same findings. A
 * rule that reads a file's name or location to decide whether it applies gets
 * at least one copy wrong; naming and placement rules are never run through it.
 */
export const everywhere = <C extends { readonly name: string }>(
  testCase: C,
): Array<C & { readonly filename: string }> =>
  PLACES.map(([place, filename]) => ({ ...testCase, name: `${testCase.name}_${place}`, filename }))
