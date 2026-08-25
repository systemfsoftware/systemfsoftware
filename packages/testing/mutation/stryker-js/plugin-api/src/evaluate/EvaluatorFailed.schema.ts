import * as S from 'effect/Schema'

/**
 * The failure an `Evaluator` port carries on its error channel.
 *
 * Tagged via the schema rather than by hand, so a consumer can dispatch on
 * `_tag` and `Workflow.make` accepts the channel wherever an evaluation
 * outcome is expressed as a decision — `Workflow.ts` refuses an untagged error
 * channel at the construction site.
 *
 * `cause` is `S.Unknown` because the thing that failed is plugin-author code
 * and narrowing it here would be a claim this package cannot keep.
 */
export class EvaluatorFailed extends S.TaggedError<EvaluatorFailed>()('EvaluatorFailed', {
  cause: S.Unknown,
}) {}
