import { declareClassPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { TestContributionEvaluator } from './test-contribution-evaluator.js'

export const strykerPlugins = [
  declareClassPlugin(PluginKind.Evaluator, 'test-contribution', TestContributionEvaluator),
]

export { TestContributionEvaluator } from './test-contribution-evaluator.js'
export {
  contributionByTestFile,
  defaultRequireTestContributionSuffixes,
  judgeTestContribution,
  toothlessTestFiles,
} from './test-contribution.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
