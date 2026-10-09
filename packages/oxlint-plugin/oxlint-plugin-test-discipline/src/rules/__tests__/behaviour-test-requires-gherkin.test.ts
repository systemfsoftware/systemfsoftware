import {
  FOREIGN_RUNNER_ACTUAL,
  FOREIGN_RUNNER_EXPECTED,
  FOREIGN_RUNNER_FIX,
  MISSING_MAKE_FEATURE_ACTUAL,
  MISSING_MAKE_FEATURE_EXPECTED,
  MISSING_MAKE_FEATURE_FIX,
  MISSING_MAKE_FEATURE_NAME,
} from '../behaviour-test-requires-gherkin.config.js'
import { behaviourTestRequiresGherkin } from '../behaviour-test-requires-gherkin.js'
import { createRuleTester, everywhere } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORTS = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { vi } from '@systemfsoftware/vitest'

const Feature = makeFeature({ it })
`

ruleTester.run('behaviour-test-requires-gherkin', behaviourTestRequiresGherkin, {
  valid: [
    ...everywhere({
      name: 'Should_Allow_BehaviourTest_When_GherkinAndMakeFeatureImported',
      code: `${FEATURE_IMPORTS}
Feature('x', () => {})
`,
    }),
    ...everywhere({
      name: 'Should_Allow_Test_When_NoGherkinHarnessImported',
      code: `
import { describe, it } from 'vitest'
`,
    }),
    ...everywhere({
      name: 'Should_Allow_Test_When_GherkinHarnessImportIsTypeOnly',
      code: `
import type { Scenario } from '@systemfsoftware/effect-gherkin-spec'
const x = 1
`,
    }),
    {
      name: 'Should_Allow_StringNamedImportFromVitest_When_ItCannotNameARunner',
      code: `${FEATURE_IMPORTS}
import { 'it' as boundIt } from 'vitest'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ForeignRunner_When_TestImportedFromVitest_CompositionFile',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from 'vitest'
import { test } from 'vitest'

const Feature = makeFeature({ it, layer })
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
      errors: [{
        messageId: 'foreignRunner',
        data: {
          name: 'test',
          expected: FOREIGN_RUNNER_EXPECTED,
          actual: FOREIGN_RUNNER_ACTUAL,
          fix: FOREIGN_RUNNER_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ForeignRunner_When_DescribeImportedFromEffectVitest_IntegrationFile',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { describe, expect } from '@effect/vitest'

const Feature = makeFeature({ it, layer })
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
      errors: [{
        messageId: 'foreignRunner',
        data: {
          name: 'describe',
          expected: FOREIGN_RUNNER_EXPECTED,
          actual: FOREIGN_RUNNER_ACTUAL,
          fix: FOREIGN_RUNNER_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ForeignRunner_When_DescribeImportedFromSystemfsoftwareVitest_IntegrationFile',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { describe } from '@systemfsoftware/vitest'

const Feature = makeFeature({ it, layer })
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
      errors: [{
        messageId: 'foreignRunner',
        data: {
          name: 'describe',
          expected: FOREIGN_RUNNER_EXPECTED,
          actual: FOREIGN_RUNNER_ACTUAL,
          fix: FOREIGN_RUNNER_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MissingMakeFeature_When_MakeFeatureImportedAsAliasFromForeignPackage',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from 'vitest'
import { makeFeature as mf } from 'vitest'
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
      errors: [{
        messageId: 'missingMakeFeature',
        data: {
          name: MISSING_MAKE_FEATURE_NAME,
          expected: MISSING_MAKE_FEATURE_EXPECTED,
          actual: MISSING_MAKE_FEATURE_ACTUAL,
          fix: MISSING_MAKE_FEATURE_FIX,
        },
      }],
    },
    ...everywhere({
      name: 'Should_Report_MissingMakeFeature_When_GherkinImportedWithoutIt',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from 'vitest'
`,
      errors: [{
        messageId: 'missingMakeFeature',
        data: {
          name: MISSING_MAKE_FEATURE_NAME,
          expected: MISSING_MAKE_FEATURE_EXPECTED,
          actual: MISSING_MAKE_FEATURE_ACTUAL,
          fix: MISSING_MAKE_FEATURE_FIX,
        },
      }],
    }),
    ...everywhere({
      name: 'Should_Report_MissingMakeFeature_When_OnlyAHarnessSubpathIsImported',
      code: `
import { Given } from '@systemfsoftware/effect-gherkin-spec/steps'
`,
      errors: [{
        messageId: 'missingMakeFeature',
        data: {
          name: MISSING_MAKE_FEATURE_NAME,
          expected: MISSING_MAKE_FEATURE_EXPECTED,
          actual: MISSING_MAKE_FEATURE_ACTUAL,
          fix: MISSING_MAKE_FEATURE_FIX,
        },
      }],
    }),
  ],
})
