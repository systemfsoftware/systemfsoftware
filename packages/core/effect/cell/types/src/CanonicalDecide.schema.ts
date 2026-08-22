import * as S from 'effect/Schema'

/**
 * The phantom error channel of the canonical decider. Uninhabited by
 * construction — nothing ever builds one, and the canonical decide cannot fail
 * — but the `Workflow` brand still demands an error channel carrying a `_tag`
 * the consumer could dispatch on. An `S.TaggedError` supplies that tag from the
 * schema, so the channel satisfies the brand without a hand-declared member.
 */
export class CanonicalDecideError extends S.TaggedError<CanonicalDecideError>()(
  'CanonicalDecideError',
  {},
) {}
