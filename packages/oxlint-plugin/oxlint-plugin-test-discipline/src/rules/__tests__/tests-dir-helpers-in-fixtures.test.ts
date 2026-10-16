import { createRuleTester } from './_tester.js'

import { testsDirHelpersInFixtures } from '../tests-dir-helpers-in-fixtures.js'

const ruleTester = createRuleTester()

const HELPER_EXPECTED = 'non-test helper and fixture modules under tests/ to live inside tests/__fixtures__/'
const HELPER_ACTUAL = 'a non-test module in tests/ outside __fixtures__/'
const HELPER_FIX =
  'move it under tests/__fixtures__/ — *.schema.ts if it declares schemas, <stem>.workflow.ts if it constructs a workflow'

const error = (name: string) => ({
  messageId: 'helperOutsideFixtures',
  data: { name, expected: HELPER_EXPECTED, actual: HELPER_ACTUAL, fix: HELPER_FIX },
})

ruleTester.run('tests-dir-helpers-in-fixtures', testsDirHelpersInFixtures, {
  valid: [
    {
      name: 'Should_Pass_When_FixtureLivesUnderFixturesDir',
      code: 'export const fake = {}',
      filename: '/repo/pkg/tests/__fixtures__/fake.ts',
    },
    {
      name: 'Should_Pass_When_IntegrationTestLivesUnderTests',
      code: 'export const x = 1',
      filename: '/repo/pkg/tests/x.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_FileLivesUnderSrc',
      code: 'export const x = 1',
      filename: '/repo/pkg/src/anything.ts',
    },
    {
      name: 'Should_Pass_When_FileLivesOutsideTestsDir',
      code: 'export const x = 1',
      filename: '/repo/pkg/lib/helper.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_HelperLivesDirectlyUnderTests',
      code: 'export const shared = {}',
      filename: '/repo/pkg/tests/helpers/shared-layers.ts',
      errors: [error('shared-layers.ts')],
    },
    {
      name: 'Should_Report_When_ObserverLivesDirectlyUnderTests',
      code: 'export const loaded = {}',
      filename: '/repo/pkg/tests/loaded.observer.ts',
      errors: [error('loaded.observer.ts')],
    },
  ],
})
