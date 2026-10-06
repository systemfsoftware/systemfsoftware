import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ActivityKey, ActivityRow, EncodedExit } from './journal.schema.js'

const ReplayActivityTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-workflow-durable-object/ReplayActivity',
)

/** The activity run already has a journaled exit: hand it back without running the activity. */
export class ReplayExit extends Schema.TaggedClass<ReplayExit>()('ReplayExit', {
  exit: EncodedExit,
}) {
  readonly [ReplayActivityTypeId] = ReplayActivityTypeId
}

/** The activity run has no journaled exit: run the activity. */
export class RunActivity extends Schema.TaggedClass<RunActivity>()('RunActivity', {}) {
  readonly [ReplayActivityTypeId] = ReplayActivityTypeId
}

export const ActivityReplay = Schema.Union([ReplayExit, RunActivity])
export type ActivityReplay = typeof ActivityReplay.Type

export class ReplayActivity extends Schema.TaggedClass<ReplayActivity>()('ReplayActivity', {
  key: ActivityKey,
  journal: Schema.Array(ActivityRow),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const keyOf = (key: ActivityKey): string => `${key.name}/${key.attempt}`

const decisionOf = (command: ReplayActivity): ActivityReplay =>
  Option.match(Arr.findFirst(command.journal, (row) => keyOf(row.key) === keyOf(command.key)), {
    onNone: () => new RunActivity({}),
    onSome: (row) => new ReplayExit({ exit: row.exit }),
  })

export const replayActivity = Workflow.make({
  command: ReplayActivity,
  decision: ActivityReplay,
  error: Schema.Never,
  decide: (command): Result.Result<ActivityReplay, never> => Result.succeed(decisionOf(command)),
})
