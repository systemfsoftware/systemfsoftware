import { Schema } from 'effect'

/** One assertion result inside vitest's JSON report. */
export const ReportAssertion = Schema.Struct({
  ancestorTitles: Schema.optional(Schema.Array(Schema.String)),
  title: Schema.String,
  status: Schema.String,
  failureMessages: Schema.optional(Schema.Array(Schema.String)),
})
export type ReportAssertion = typeof ReportAssertion.Type

/** One test file inside vitest's JSON report. */
export const ReportTestFile = Schema.Struct({
  name: Schema.String,
  assertionResults: Schema.optional(Schema.Array(ReportAssertion)),
})
export type ReportTestFile = typeof ReportTestFile.Type

/** The document vitest's `json` reporter writes beside `disposition.json`. */
export const Report = Schema.Struct({
  testResults: Schema.optional(Schema.Array(ReportTestFile)),
})
export type Report = typeof Report.Type
