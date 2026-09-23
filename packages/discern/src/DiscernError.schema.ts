import { Schema } from 'effect'

export class UncertainMatchError extends Schema.TaggedError<UncertainMatchError>()('UncertainMatchError', {
  caseId: Schema.String,
  reason: Schema.optional(Schema.String),
}) {
  override get message(): string {
    return `Semantic case "${this.caseId}" was uncertain${this.reason === undefined ? '' : `: ${this.reason}`}`
  }
}

export class ExhaustiveMatchError extends Schema.TaggedError<ExhaustiveMatchError>()('ExhaustiveMatchError', {}) {
  override get message(): string {
    return 'A supposedly exhaustive semantic classification had no matching case'
  }
}

export class DecisionIdCollisionError extends Schema.TaggedError<DecisionIdCollisionError>()(
  'DecisionIdCollisionError',
  {
    decisionId: Schema.String,
  },
) {
  override get message(): string {
    return `Decision id collision for "${this.decisionId}": definitions differ`
  }
}

export class InvalidThresholdError extends Schema.TaggedError<InvalidThresholdError>()(
  'InvalidThresholdError',
  {
    threshold: Schema.String,
    value: Schema.Finite,
    limit: Schema.Finite,
    message: Schema.String,
  },
) {}
