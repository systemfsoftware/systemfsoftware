import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { makeContributionGateEvaluator } from './test-contribution-evaluator.js'

export const strykerPlugins = [
  declarePlugin('Evaluator', 'contribution-gate', makeContributionGateEvaluator),
]

export { makeContributionGateEvaluator } from './test-contribution-evaluator.js'
export type { ContributionGateEvaluator, ContributionGateOptions } from './test-contribution-evaluator.js'
export {
  contributionByTestFile,
  defaultRequireTestContributionSuffixes,
  judgeTestContribution,
  toothlessTestFiles,
} from './test-contribution.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
