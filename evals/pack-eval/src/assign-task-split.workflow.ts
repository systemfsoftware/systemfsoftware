import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema } from 'effect'

const TaskSplitTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/TaskSplitDecision')
type TaskSplitTypeId = typeof TaskSplitTypeId

export class AssignedToDev extends Schema.TaggedClass<AssignedToDev>()('AssignedToDev', {
  split: Schema.Literal('dev'),
}) {
  readonly [TaskSplitTypeId] = TaskSplitTypeId
}

export class AssignedToTest extends Schema.TaggedClass<AssignedToTest>()('AssignedToTest', {
  split: Schema.Literal('test'),
}) {
  readonly [TaskSplitTypeId] = TaskSplitTypeId
}

export const AssignTaskSplitDecision = Schema.Union([AssignedToDev, AssignedToTest])
export type AssignTaskSplitDecision = typeof AssignTaskSplitDecision.Type

export class AssignTaskSplitCommand extends Schema.Class<AssignTaskSplitCommand>('AssignTaskSplitCommand')({
  devTasks: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  testTasks: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decisionOf = (devFirst: boolean): AssignTaskSplitDecision =>
  Match.value(devFirst).pipe(
    Match.when(true, () => new AssignedToDev({ split: 'dev' })),
    Match.when(false, () => new AssignedToTest({ split: 'test' })),
    Match.exhaustive,
  )

const decide = (command: AssignTaskSplitCommand): Result.Result<AssignTaskSplitDecision, never> =>
  Result.succeed(decisionOf(command.devTasks <= command.testTasks))

export const assignTaskSplit = Workflow.make({
  command: AssignTaskSplitCommand,
  decision: AssignTaskSplitDecision,
  error: Schema.Never,
  decide,
})
