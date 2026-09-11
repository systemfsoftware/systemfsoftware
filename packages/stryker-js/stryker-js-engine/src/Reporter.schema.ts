import { MetricsResultSchema } from '@systemfsoftware/stryker-js/Metrics'
import { MutationTestResultSchema } from '@systemfsoftware/stryker-js/Report'
import * as S from 'effect/Schema'
export class ClearTextReportCommand extends S.TaggedClass<ClearTextReportCommand>()('ClearTextReportCommand', {
  report: MutationTestResultSchema,
  metrics: MetricsResultSchema,
}) {}
