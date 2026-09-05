import * as S from 'effect/Schema'

export class ReporterFailed extends S.TaggedError<ReporterFailed>()('ReporterFailed', {
  cause: S.String,
  event: S.Literals([
    'onDryRunCompleted',
    'onMutationTestingPlanReady',
    'onMutantTested',
    'onMutationTestReportReady',
    'wrapUp',
  ]),
  reporterName: S.String,
}) {}
