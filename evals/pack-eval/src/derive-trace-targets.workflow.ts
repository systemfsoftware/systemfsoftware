import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema } from 'effect'
import { Pack } from './pack-rule.schema.js'
import { TaskSet } from './task-set.schema.js'

const TraceTargetsTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/TraceTargets')
type TraceTargetsTypeId = typeof TraceTargetsTypeId

export class TraceTarget extends Schema.Class<TraceTarget>('TraceTarget')({
  packId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
}) {}

export class TraceTargetsDerived extends Schema.TaggedClass<TraceTargetsDerived>()('TraceTargetsDerived', {
  targets: Schema.Array(TraceTarget),
}) {
  readonly [TraceTargetsTypeId] = TraceTargetsTypeId
}

export class NothingToTrace extends Schema.TaggedClass<NothingToTrace>()('NothingToTrace', {
  taskCount: Schema.Int,
  packCount: Schema.Int,
}) {
  readonly [TraceTargetsTypeId] = TraceTargetsTypeId
}

export const DeriveTraceTargetsDecision = Schema.Union([TraceTargetsDerived, NothingToTrace])
export type DeriveTraceTargetsDecision = typeof DeriveTraceTargetsDecision.Type

export class DuplicateTraceTarget extends Schema.TaggedError<DuplicateTraceTarget>()('DuplicateTraceTarget', {
  packId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
}) {}

export class DeriveTraceTargets extends Schema.TaggedClass<DeriveTraceTargets>()('DeriveTraceTargets', {
  tasks: TaskSet,
  packs: Schema.Array(Pack),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const targetOf = (packId: string, taskId: string): TraceTarget => new TraceTarget({ packId, taskId })

const targetsOf = (command: DeriveTraceTargets): ReadonlyArray<TraceTarget> =>
  command.packs.flatMap((pack) => command.tasks.tasks.map((task) => targetOf(pack.id, task.id)))

const pairKeyOf = (target: TraceTarget): string => `${target.packId}\u0000${target.taskId}`

const repeatsAnEarlierPair = (targets: ReadonlyArray<TraceTarget>, index: number, target: TraceTarget): boolean => {
  const earlier = targets.slice(0, index)
  return earlier.some((other) => pairKeyOf(other) === pairKeyOf(target))
}

const firstDuplicateOf = (targets: ReadonlyArray<TraceTarget>): Option.Option<TraceTarget> =>
  Option.fromNullishOr(targets.find((target, index) => repeatsAnEarlierPair(targets, index, target)))

const refuseDuplicate = (targets: ReadonlyArray<TraceTarget>): Result.Result<undefined, DuplicateTraceTarget> =>
  Option.match(firstDuplicateOf(targets), {
    onNone: () => Result.succeed(undefined),
    onSome: (duplicate) =>
      Result.fail(new DuplicateTraceTarget({ packId: duplicate.packId, taskId: duplicate.taskId })),
  })

const decisionOf = (
  command: DeriveTraceTargets,
  targets: ReadonlyArray<TraceTarget>,
): DeriveTraceTargetsDecision =>
  Match.value(targets.length === 0).pipe(
    Match.when(true, () =>
      new NothingToTrace({ taskCount: command.tasks.tasks.length, packCount: command.packs.length })),
    Match.when(false, () =>
      new TraceTargetsDerived({ targets })),
    Match.exhaustive,
  )

const decide = (command: DeriveTraceTargets): Result.Result<DeriveTraceTargetsDecision, DuplicateTraceTarget> =>
  Result.gen(function*() {
    const targets = targetsOf(command)
    yield* refuseDuplicate(targets)
    return decisionOf(command, targets)
  })

export const deriveTraceTargets = Workflow.make({
  command: DeriveTraceTargets,
  decision: DeriveTraceTargetsDecision,
  error: DuplicateTraceTarget,
  decide,
})
