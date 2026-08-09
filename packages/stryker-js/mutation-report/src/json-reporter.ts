import path from 'path'

import { schema, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import { pathToFileURL } from 'url'
import { reporterUtil } from './reporter-util.js'

const INDENTION_LEVEL = 0
export const RESOURCES_DIR_NAME = 'strykerResources'

export class JsonReporter implements Reporter {
  private mainPromise: Promise<void> | undefined

  constructor(
    private readonly options: StrykerOptions,
    private readonly log: Logger,
  ) {
    /**
     * A run that dies before `onMutationTestReportReady` never writes, so the previous
     * run's report stays on disk and every consumer reads it as a description of the run
     * that just failed. Measured 2026-08-01 on omp-claude-compat: three checker-init
     * failures left a stale report that a contribution checker read as evidence two test
     * files defended nothing — one of them defends two mutants. `BroadcastReporter`
     * constructs every reporter once, before the dry run, so clearing here makes the
     * file's presence mean the run reached the end. Synchronous on purpose: the write
     * happens much later and must not race a pending unlink.
     */
    reporterUtil.removeFileSync(path.resolve(path.normalize(options.jsonReporter.fileName)))
  }

  public static readonly inject = tokens(
    commonTokens.options,
    commonTokens.logger,
  )

  public onMutationTestReportReady(report: schema.MutationTestResult): void {
    this.mainPromise = this.generateReport(report)
  }

  public wrapUp(): Promise<void> | undefined {
    return this.mainPromise
  }

  private async generateReport(report: schema.MutationTestResult) {
    const filePath = path.normalize(this.options.jsonReporter.fileName)
    this.log.debug(`Using relative path ${filePath}`)
    await reporterUtil.writeFile(
      path.resolve(filePath),
      JSON.stringify(report, null, INDENTION_LEVEL),
    )
    this.log.info(
      `Your report can be found at: ${pathToFileURL(filePath).href}`,
    )
  }
}
