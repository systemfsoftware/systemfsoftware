import { ExitClass, setPendingExitClass } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import { schema, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Evaluator } from '@systemfsoftware/stryker-js-plugin-api/evaluate'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { judgeTestContribution } from './test-contribution.js'

export class TestContributionEvaluator implements Evaluator {
  public static readonly inject = tokens(commonTokens.options, commonTokens.logger)

  constructor(
    private readonly options: StrykerOptions,
    private readonly log: Logger,
  ) {}

  public evaluate(report: schema.MutationTestResult): void {
    const verdict = judgeTestContribution(
      report,
      this.options['requireTestContribution'],
      this.options.disableBail,
    )
    if (verdict === undefined) {
      this.log.debug(
        "No test contribution required. Won't fail the build for a test file that kills nothing another test file does not also kill. Set `requireTestContribution` to change this behavior.",
      )
      return
    }
    if (!verdict.failed) {
      this.log.info(verdict.message)
      return
    }
    this.log.error(`${verdict.message}\nSetting exit code to 1 (failure).`)
    this.log.info(
      '(sharpen or delete them, or set `requireTestContribution = null` to prevent this error in the future)',
    )
    setPendingExitClass(ExitClass.VerdictFail)
  }
}
