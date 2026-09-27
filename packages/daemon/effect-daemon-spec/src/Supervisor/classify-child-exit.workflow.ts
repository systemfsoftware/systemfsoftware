import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Cause, Exit, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AbnormalExit, ChildExitDecision, NormalExit, ShutdownExit } from './ChildExitDecision.schema.js'

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
