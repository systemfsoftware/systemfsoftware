/**
 * Html reporter — Cell pipeline that renders the mutation report to a file.
 */

// node:url — no Effect Path equivalent for file URL conversion
import { pathToFileURL } from 'url'
// node:module — require.resolve for bundled script lookup
import { createRequire } from 'module'

import { Cell } from '@systemfsoftware/effect-cell-types'
import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import { writeOutputFile } from '@systemfsoftware/stryker-js/output-file'
import type { ProvidedStrykerOptions } from '@systemfsoftware/stryker-js/provided-options'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
} from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import type { ReporterService } from '@systemfsoftware/stryker-js/Reporter'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type * as schema from 'mutation-testing-report-schema/api'

import { HtmlReportCommand, HtmlReportError } from './Reporter.schema.js'
import { HtmlDocument, makeHtmlDocument } from './Reporter.workflow.js'
interface HtmlReportPhases extends Cell.Phases {
  readonly command: void
  readonly raw: { readonly report: unknown; readonly scriptContent: string }
  readonly decoded: HtmlReportCommand
  readonly decision: HtmlDocument
  readonly decisionError: HtmlReportError
  readonly output: string
  readonly response: void
  readonly decodeError: unknown
  readonly readError: PlatformError
  readonly writeError: PlatformError
}

export const makeHtmlReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}): ReporterService => {
  const options = params.options
  const fs = params.fs
  const path = params.path

  let heldReport: schema.MutationTestResult | undefined

  const htmlReportDescription: Cell.WriteDone<HtmlReportPhases> = pipe(
    Cell.read<HtmlReportPhases>(() =>
      Effect.gen(function*() {
        const require = createRequire(import.meta.url)
        const scriptPath = require.resolve('mutation-testing-elements/dist/mutation-test-elements.js')
        const scriptContent = yield* fs.readFileString(scriptPath)
        const report: unknown = heldReport
        return { report, scriptContent }
      })
    ),
    Cell.decode<HtmlReportPhases>((raw) =>
      S.decodeUnknownResult(HtmlReportCommand)({ report: raw.report, scriptContent: raw.scriptContent })
    ),
    Cell.decide<HtmlReportPhases>(makeHtmlDocument),
    Cell.encode<HtmlReportPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: () => '',
        onSuccess: (doc) => doc.html,
      })
    ),
    Cell.write<HtmlReportPhases>((html) =>
      Effect.gen(function*() {
        if (options === undefined) return
        const fileName = options.htmlReporter.fileName
        yield* Effect.logDebug(`Using file "${fileName}"`)
        yield* writeOutputFile(fs, path, fileName, html)
        yield* Effect.logInfo(`Your report can be found at: ${pathToFileURL(path.resolve(fileName)).href}`)
      })
    ),
  )

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,
    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,
    onMutantTested: (_result: MutantResult) => Effect.void,
    onMutationTestReportReady: (report: schema.MutationTestResult, _metrics: MutationTestMetricsResult) =>
      Effect.sync(() => {
        heldReport = report
      }),
    wrapUp: Effect.gen(function*() {
      if (options === undefined) return
      if (heldReport === undefined) return
      yield* Cell.apply(htmlReportDescription, undefined)
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          new ReporterFailed({ reporterName: 'html', event: 'wrapUp', cause: Cause.pretty(cause) }),
        )
      ),
    ),
  }
}
