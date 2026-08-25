import * as S from 'effect/Schema'

/**
 * The failure a `Reporter` port carries on its error channel.
 *
 * Tagged via the schema rather than by hand, so a consumer can dispatch on
 * `_tag` and `Workflow.make` accepts the channel wherever a reporter outcome
 * is expressed as a decision — `Workflow.ts` refuses an untagged error channel
 * at the construction site.
 *
 * `reporterName` names the reporter that failed, because the broadcast fans
 * out to N reporters and "a reporter threw" is not actionable.
 * `event` names which lifecycle event failed, so the caller can dispatch
 * without parsing a message string.
 * `cause` is `S.Unknown` because the thing that failed is plugin-author code
 * and narrowing it here would be a claim this package cannot keep.
 */
export class ReporterFailed extends S.TaggedError<ReporterFailed>()('ReporterFailed', {
  reporterName: S.String,
  event: S.Literals([
    'onDryRunCompleted',
    'onMutationTestingPlanReady',
    'onMutantTested',
    'onMutationTestReportReady',
    'wrapUp',
  ]),
  cause: S.Unknown,
}) {}
