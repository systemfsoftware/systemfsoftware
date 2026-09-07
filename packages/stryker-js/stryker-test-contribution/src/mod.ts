import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { testContributionEvaluatorLayer } from './test-contribution-evaluator.js'

export const strykerPlugins = [
  declarePlugin('Evaluator', 'test-contribution', testContributionEvaluatorLayer),
]

export { testContributionEvaluatorLayer } from './test-contribution-evaluator.js'
export type { TestContributionInput, TestContributionVerdict, TestFileContribution } from './test-contribution.js'
