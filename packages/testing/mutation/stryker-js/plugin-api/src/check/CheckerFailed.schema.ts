import * as S from 'effect/Schema'

/**
 * The failure a `Checker` port carries on its error channel.
 *
 * Tagged via the schema rather than by hand, so a consumer can dispatch on
 * `_tag` and `Workflow.make` accepts the channel wherever a checker outcome is
 * expressed as a decision — `Workflow.ts` refuses an untagged error channel at
 * the construction site.
 *
 * `cause` is `S.Unknown` because the thing that failed is a compiler, a spawned
 * process, or a plugin author's code, and narrowing it here would be a claim
 * this package cannot keep. The dispatchable facts are the tag and `mutantIds`:
 * which mutants the caller must now treat as unchecked.
 */
export class CheckerFailed extends S.TaggedError<CheckerFailed>()('CheckerFailed', {
  checkerName: S.String,
  mutantIds: S.Array(S.String),
  cause: S.Unknown,
}) {}
