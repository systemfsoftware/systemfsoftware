import { declarePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { testContributionEvaluatorLayer } from './test-contribution-evaluator.js'

export const strykerPlugins = [
  declarePlugin(PluginKind.Evaluator, 'test-contribution', testContributionEvaluatorLayer),
]

export { makeTestContributionEvaluatorService, testContributionEvaluatorLayer } from './test-contribution-evaluator.js'
export {
  contributionByTestFile,
  defaultRequireTestContributionSuffixes,
  judgeTestContribution,
  toothlessTestFiles,
} from './test-contribution.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
