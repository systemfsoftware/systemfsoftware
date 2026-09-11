import * as S from 'effect/Schema'
import { MutationTestResultPayload, RepoMetricsResultPayload } from '../run/abi-payload.schema.js'
export class ClearTextReportCommand extends S.TaggedClass<ClearTextReportCommand>()('ClearTextReportCommand', {
  report: MutationTestResultPayload,
  metrics: RepoMetricsResultPayload,
}) {}
