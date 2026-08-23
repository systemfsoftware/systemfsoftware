import { declareClassPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as S from 'effect/Schema'

import { TestContributionOptions } from './require-test-contribution.schema.js'
import { TestContributionEvaluator } from './test-contribution-evaluator.js'

export const defaultRequireTestContributionSuffixes = [
  '.workflow.property.test.ts',
  '.policy.property.test.ts',
  '.kernel.property.test.ts',
] as const

export const strykerPlugins = [
  declareClassPlugin(PluginKind.Evaluator, 'test-contribution', TestContributionEvaluator),
]

export const strykerValidationSchema: Record<string, unknown> = S.toJsonSchemaDocument(
  TestContributionOptions,
).schema

export {
  RequireTestContribution,
  TestContributionOptions as TestContributionOptionsSchema,
} from './require-test-contribution.schema.js'
export { TestContributionEvaluator } from './test-contribution-evaluator.js'
export {
  contributionByTestFile,
  judgeTestContribution,
  suffixesToRequire,
  toothlessTestFiles,
} from './test-contribution.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
