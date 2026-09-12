import { causeText, errorToString } from '@systemfsoftware/stryker-js'
import type { EvaluatorVerdict } from '@systemfsoftware/stryker-js/Evaluator'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'

import { judgeTestContribution } from './test-contribution.js'

export interface ContributionGateOptions {
  readonly disableBail?: boolean | undefined
}

export type ContributionGateEvaluator = (report: MutationTestResult) => EvaluatorVerdict

const UNREADABLE_REPORT = 'the report could not be read'

const failureText = (cause: unknown): string => {
  const detail = causeText(cause, 0) ?? errorToString(cause)
  if (detail.length > 0) return detail
  return UNREADABLE_REPORT
}

export const makeContributionGateEvaluator =
  (options: ContributionGateOptions): ContributionGateEvaluator => (report) => {
    try {
      const verdict = judgeTestContribution(report, options.disableBail === true)
      if (!verdict.failed) return null
      return { exitClass: 'VerdictFail', message: verdict.message }
    } catch (cause) {
      return { exitClass: 'RuntimeError', message: failureText(cause) }
    }
  }
