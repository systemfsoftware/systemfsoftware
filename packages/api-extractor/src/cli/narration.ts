import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import { bannerText, debugReportText, errorReportText } from '../console-text.js'
import { MessageWriter } from '../message-writer.service.js'
import { extractorVersion } from '../version.js'
import { CliReportedError, type ReportLine } from './reported-failure.schema.js'

const errorStackText = (message: string): string => new Error(message).stack ?? message

export const reportedTextOf = dual<
  (debug: boolean) => (message: string) => string,
  (message: string, debug: boolean) => string
>(2, (message: string, debug: boolean): string =>
  Match.value(debug).pipe(
    Match.when(true, () => debugReportText(errorStackText(message))),
    Match.when(false, () => errorReportText(message)),
    Match.exhaustive,
  ))

const lineOf = (level: ReportLine['level'], text: string): ReportLine => ({ level, text })

export const reportedFailure = dual<
  (text: string) => (level: ReportLine['level']) => CliReportedError,
  (level: ReportLine['level'], text: string) => CliReportedError
>(
  2,
  (level: ReportLine['level'], text: string): CliReportedError =>
    new CliReportedError({ lines: [lineOf(level, text)] }),
)

export const refusalReport = (reportedText: string): CliReportedError =>
  new CliReportedError({ lines: [lineOf('info', bannerText(extractorVersion)), lineOf('error', reportedText)] })

export const failReported = (
  reported: CliReportedError,
): Effect.Effect<never, CliReportedError, MessageWriter> =>
  Effect.flatMap(MessageWriter, (writer) =>
    Effect.andThen(
      Effect.forEach(
        reported.lines,
        (line) => writer.write(line.level, line.text),
        { concurrency: 1, discard: true },
      ),
      Effect.fail(reported),
    ))

const bannerLine: ReportLine = lineOf('info', bannerText(extractorVersion))

/** The banner lines a run narrates at start: upstream's banner, or none when the run is quiet. */
const bannerLines = (quiet: boolean): ReadonlyArray<ReportLine> => Arr.filter([bannerLine], () => !quiet)

export const narrateBanner = (quiet: boolean): Effect.Effect<void, never, MessageWriter> =>
  Effect.flatMap(MessageWriter, (writer) =>
    Effect.forEach(
      bannerLines(quiet),
      (line) => writer.write(line.level, line.text),
      { concurrency: 1, discard: true },
    ))
