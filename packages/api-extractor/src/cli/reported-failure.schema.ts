import { Runtime, Schema } from 'effect'

import { LogLevel } from '../collector/message-router.schema.js'

export const ReportLine = Schema.Struct({
  level: LogLevel,
  text: Schema.String,
})
export type ReportLine = typeof ReportLine.Type

export class CliReportedError extends Schema.TaggedError<CliReportedError>()('CliReportedError', {
  lines: Schema.Array(ReportLine),
}) {
  override readonly [Runtime.errorReported] = false

  override get message(): string {
    return this.lines.map((line) => line.text).join('\n')
  }
}
