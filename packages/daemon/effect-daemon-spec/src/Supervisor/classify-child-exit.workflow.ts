import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Cause, Exit, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

/**
 * The one classification of a child's `Exit` into the supervisor's termination
 * reasons (KTD5): a stop the supervisor asked for is `Shutdown`, a success is
 * `Normal`, an interruption is `Shutdown`, and anything else is `Abnormal`.
 * Every medium reports through this workflow, and the branch exists only here.
 */
const ChildExitTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-spec/ChildExitDecision',
)
type ChildExitTypeId = typeof ChildExitTypeId

/** The child ended on its own success. */
export class NormalExit extends Schema.TaggedClass<NormalExit>()('Normal', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

/** The child was interrupted — an owned shutdown, or one it raised itself. */
export class ShutdownExit extends Schema.TaggedClass<ShutdownExit>()('Shutdown', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

/** The child failed with something other than an interruption. */
export class AbnormalExit extends Schema.TaggedClass<AbnormalExit>()('Abnormal', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

export const ChildExitDecision = Schema.Union([NormalExit, ShutdownExit, AbnormalExit])
export type ChildExitDecision = typeof ChildExitDecision.Type

export class ClassifyChildExit extends Schema.TaggedClass<ClassifyChildExit>()('ClassifyChildExit', {
  stopping: Schema.Boolean,
  exit: Schema.Exit(Schema.Void, Schema.Unknown, Schema.Unknown),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const failureOf = <Failure>(cause: Cause.Cause<Failure>): ChildExitDecision =>
  Match.value(Cause.hasInterruptsOnly(cause)).pipe(
    Match.when(true, () => ShutdownExit.make()),
    Match.when(false, () => AbnormalExit.make()),
    Match.exhaustive,
  )

const endedOf = <Failure>(exit: Exit.Exit<void, Failure>): ChildExitDecision =>
  Exit.match(exit, {
    onSuccess: () => NormalExit.make(),
    onFailure: failureOf,
  })

const decisionOf = (command: ClassifyChildExit): ChildExitDecision =>
  Match.value(command.stopping).pipe(
    Match.when(true, () => ShutdownExit.make()),
    Match.when(false, () => endedOf(command.exit)),
    Match.exhaustive,
  )

export const classifyChildExit = Workflow.make({
  command: ClassifyChildExit,
  decision: ChildExitDecision,
  error: Schema.Never,
  decide: (command): Result.Result<ChildExitDecision, never> => Result.succeed(decisionOf(command)),
})
