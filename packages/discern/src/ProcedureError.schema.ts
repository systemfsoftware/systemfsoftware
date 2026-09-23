import { Schema } from 'effect'
import { RouteCandidate } from './Route.schema.js'

/**
 * Routing recursed past its ceiling.
 *
 * Only routing can recurse without a fixed bottom — static `run` calls are
 * bounded by the code that makes them — so the depth limit counts {@link
 * RoutingUncertainError} invocations alone.
 */
export class DepthExceededError extends Schema.TaggedError<DepthExceededError>()('DepthExceededError', {
  depth: Schema.Finite,
  limit: Schema.Finite,
}) {
  override get message(): string {
    return `Procedure routing reached depth ${this.depth}, at the limit of ${this.limit}`
  }
}

export class NoEligibleProcedureError extends Schema.TaggedError<NoEligibleProcedureError>()(
  'NoEligibleProcedureError',
  {
    reason: Schema.String,
  },
) {
  override get message(): string {
    return this.reason
  }
}

export class RoutingUncertainError extends Schema.TaggedError<RoutingUncertainError>()('RoutingUncertainError', {
  reason: Schema.String,
  ranked: Schema.Array(RouteCandidate),
}) {
  override get message(): string {
    return `Could not route the request confidently: ${this.reason}`
  }
}

export class DuplicateProcedureIdError extends Schema.TaggedError<DuplicateProcedureIdError>()(
  'DuplicateProcedureIdError',
  {
    id: Schema.String,
  },
) {
  override get message(): string {
    return `Duplicate procedure id "${this.id}" in registry`
  }
}

export class UnknownProcedureError extends Schema.TaggedError<UnknownProcedureError>()('UnknownProcedureError', {
  id: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `No procedure "${this.id}" in this registry (have: ${this.known.join(', ')})`
  }
}
