import * as Schema from 'effect/Schema'

import { ReportOutcomeSchema } from '../choose-extraction.workflow.js'
import { ExtractionMaterial } from '../write-plan.schema.js'
import { PlannedReport } from '../write-plan.workflow.js'

export const WritePlanRequest = Schema.TaggedStruct('WritePlanCommand', {
  ...ExtractionMaterial.fields,
  printApiReportDiff: Schema.Boolean,
  infoAdmitted: Schema.Boolean,
  verboseAdmitted: Schema.Boolean,
  preambleText: Schema.String,
  noticeText: Schema.NullOr(Schema.String),
  footerText: Schema.String,
  reports: Schema.Array(PlannedReport),
  outcomes: Schema.Array(ReportOutcomeSchema),
  succeeded: Schema.Boolean,
})

export type WritePlanRequest = Schema.Schema.Type<typeof WritePlanRequest>
