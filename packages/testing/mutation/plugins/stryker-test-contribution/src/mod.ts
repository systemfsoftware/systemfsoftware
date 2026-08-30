import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { testContributionEvaluatorLayer } from './test-contribution-evaluator.js'

/** @public */
export const strykerPlugins = [
  declarePlugin('Evaluator', 'test-contribution', testContributionEvaluatorLayer),
]

export { makeTestContributionEvaluatorService, testContributionEvaluatorLayer } from './test-contribution-evaluator.js'
export {
  contributionByTestFile,
  defaultRequireTestContributionSuffixes,
  judgeTestContribution,
  toothlessTestFiles,
} from './test-contribution.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
