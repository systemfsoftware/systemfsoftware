import {
  FOREIGN_RUNNER_ACTUAL,
  FOREIGN_RUNNER_EXPECTED,
  FOREIGN_RUNNER_FIX,
  MISSING_MAKE_FEATURE_ACTUAL,
  MISSING_MAKE_FEATURE_EXPECTED,
  MISSING_MAKE_FEATURE_FIX,
  MISSING_MAKE_FEATURE_NAME,
} from '../feature-test-requires-gherkin.config.js'
import { featureTestRequiresGherkin } from '../feature-test-requires-gherkin.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORTS = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })
`

ruleTester.run('feature-test-requires-gherkin', featureTestRequiresGherkin, {
  valid: [
    {
      name: 'Should_Allow_FeatureTest_When_GherkinAndMakeFeatureImported',
      code: `${FEATURE_IMPORTS}
Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
    },
    {
      name: 'Should_Allow_NonFeatureTest_When_VitestRunnerImported',
      code: `
import { describe, it } from 'vitest'
`,
      filename: '/repo/pkg/tests/x.test.ts',
    },
    {
      name: 'Should_Allow_StringNamedImportFromVitest_When_ItCannotNameARunner',
      code: `${FEATURE_IMPORTS}
import { 'it' as boundIt } from 'vitest'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ForeignRunner_When_TestImportedFromVitest',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from 'vitest'
import { test } from 'vitest'

const Feature = makeFeature({ it, layer })
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
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
      name: 'Should_Report_ForeignRunner_When_DescribeImportedFromEffectVitest',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { describe, expect } from '@effect/vitest'

const Feature = makeFeature({ it, layer })
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
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
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
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
    {
      name: 'Should_Report_MissingMakeFeature_When_GherkinImportedWithoutIt',
      code: `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from 'vitest'
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
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
    {
      name: 'Should_Report_MissingMakeFeature_When_FeatureFileHasNoImports',
      code: `
const x = 1
`,
      filename: '/repo/pkg/__tests__/hook.feature.test.ts',
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
  ],
})
