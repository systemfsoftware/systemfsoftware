import { Schema as S } from 'effect'

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
export class AfterFailedExpect extends S.TaggedError<AfterFailedExpect>()('AfterFailedExpect', {
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
export class MissingBudget extends S.TaggedError<MissingBudget>()('MissingBudget', {
  detail: S.String,
}) {
  override get message(): string {
    return this.detail
  }
}
