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

/**
 * The read did not carry a command this registry's routing could decode.
 *
 * The refusal names the registry's membership — what the request *was* offered
 * to — and keeps the rejection as `cause`, the same context-carrying shape
 * every other infrastructure refusal in the package takes.
 */
export class ProcedureCommandRejectedError extends Schema.TaggedError<ProcedureCommandRejectedError>()(
  'ProcedureCommandRejectedError',
  {
    membership: Schema.Array(Schema.String),
    issue: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  override get message(): string {
    return `Routing rejected the command for a registry of ${this.membership.join(', ')}: ${this.issue}`
  }
}
