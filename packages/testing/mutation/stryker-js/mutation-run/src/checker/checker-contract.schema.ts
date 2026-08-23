import * as S from 'effect/Schema'

/**
 * A checker answered about a mutant nobody asked it about.
 *
 * Separate from the missing-result case because they mean opposite things: this
 * one says the checker invented work, the other says it dropped work. Reporting
 * both as one failure loses the only fact that tells you which plugin bug you
 * are looking at.
 */
export class CheckerAnsweredUnrequested extends S.TaggedError<CheckerAnsweredUnrequested>()(
  'CheckerAnsweredUnrequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    unrequestedIds: S.Array(S.String),
    requestedIds: S.Array(S.String),
  },
) {}

/**
 * A checker did not answer about mutants it was asked about.
 *
 * Silently dropping these would mark them as needing no test, so an unchecked
 * mutant would be reported as covered.
 */
export class CheckerSkippedRequested extends S.TaggedError<CheckerSkippedRequested>()(
  'CheckerSkippedRequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    missingIds: S.Array(S.String),
  },
) {}

/** Either way a checker can break its side of the contract. */
export type CheckerContractBroken = CheckerAnsweredUnrequested | CheckerSkippedRequested
