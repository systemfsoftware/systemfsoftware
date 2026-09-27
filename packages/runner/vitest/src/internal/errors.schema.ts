import { Schema as S } from 'effect'

/**
 * The contract rules a rendered failure record can break (R10, KTD7).
 *
 * @internal
 */
export const Breach = S.Literals(['R1', 'R2', 'R6'])

/** @internal */
export type Breach = typeof Breach.Type

/** A record's breaches, in the order the renderer found them.
 *
 * @internal
 */
export const Breaches = S.Array(Breach)

/** @internal */
export type Breaches = typeof Breaches.Type

/** The fixed prose each breach is refused with; nothing ever reads a refusal back, so it cannot recurse. */
const REFUSED_BREACH_TEXT: Record<Breach, string> = {
  R1: 'the headline is empty',
  R2: 'the record names no source location',
  R6: 'a replay value names a run no generator chose, or the rerun line is missing',
}

/**
 * The one detail a record refusal carries: every breach the renderer found, in the prose above (R10, KTD7). The
 * breach letter is not printed: a reader acts on what is missing, not on which requirement numbered it.
 *
 * @internal
 */
export const refusedRecordDetail = (breaches: Breaches): string =>
  `✗ refused a failure record: ${breaches.map((breach) => REFUSED_BREACH_TEXT[breach]).join(', and ')}`

/** @internal */
export class NonBooleanVerdict extends S.TaggedError<NonBooleanVerdict>()('NonBooleanVerdict', {
  detail: S.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/** @internal */
export class LeakedState extends S.TaggedError<LeakedState>()('LeakedState', {
  detail: S.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/** @internal */
export class Slop extends S.TaggedError<Slop>()('Slop', {
  detail: S.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/** @internal */
export class InvalidBudget extends S.TaggedError<InvalidBudget>()('InvalidBudget', {
  detail: S.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/** @internal */
export class FailureRecordRefused extends S.TaggedError<FailureRecordRefused>()('FailureRecordRefused', {
  breaches: Breaches,
  cause: S.optional(S.Unknown),
}) {
  override get message(): string {
    return refusedRecordDetail(this.breaches)
  }
}
