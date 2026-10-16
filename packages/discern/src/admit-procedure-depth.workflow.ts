import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const ProcedureDepthTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/ProcedureDepth')
type ProcedureDepthTypeId = typeof ProcedureDepthTypeId

export class DepthAdmitted extends Schema.TaggedClass<DepthAdmitted>()('DepthAdmitted', {
  depth: Schema.Finite,
  limit: Schema.Finite,
}) {
  readonly [ProcedureDepthTypeId] = ProcedureDepthTypeId
}

/**
 * Routing recursed past its ceiling.
 *
 * Only routing can recurse without a fixed bottom — static `run` calls are
 * bounded by the code that makes them — so the depth limit counts uncertain
 * routing invocations alone.
 */
export class DepthExceededError extends Schema.TaggedError<DepthExceededError>()('DepthExceededError', {
  depth: Schema.Finite,
  limit: Schema.Finite,
}) {
  override get message(): string {
    return `Procedure routing reached depth ${this.depth}, at the limit of ${this.limit}`
  }
}

export class AdmitProcedureDepth extends Schema.TaggedClass<AdmitProcedureDepth>()('AdmitProcedureDepth', {
  depth: Schema.Finite,
  limit: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const admitProcedureDepth = Workflow.make({
  command: AdmitProcedureDepth,
  decision: DepthAdmitted,
  error: DepthExceededError,
  decide: (command): Result.Result<DepthAdmitted, DepthExceededError> =>
    Match.value(command.depth < command.limit).pipe(
      Match.when(true, () => Result.succeed(new DepthAdmitted({ depth: command.depth, limit: command.limit }))),
      Match.when(
        false,
        () => Result.fail(new DepthExceededError({ depth: command.depth, limit: command.limit })),
      ),
      Match.exhaustive,
    ),
})
