import { Schema as S } from 'effect'
import { refusedRecordDetail } from './refusals.js'

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
  breaches: S.Array(S.Literals(['R1', 'R2', 'R6'])),
  cause: S.optional(S.Unknown),
}) {
  override get message(): string {
    return refusedRecordDetail(this.breaches)
  }
}
