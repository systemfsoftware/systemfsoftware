import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  DeriveTraceTargets,
  deriveTraceTargets,
  DuplicateTraceTarget,
  NothingToTrace,
  TraceTargetsDerived,
} from '../derive-trace-targets.workflow.js'
import { Pack } from '../pack-rule.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'

const keyOf = (packId: string, taskId: string): string => `${packId} ${taskId}`

const targetKeysOf = (command: DeriveTraceTargets): ReadonlyArray<string> =>
  command.packs.flatMap((pack) => command.tasks.tasks.map((task) => keyOf(pack.id, task.id)))

it.prop(
  '∀c_taskPackPairs_≡OneTargetEachWhenNoDuplicate',
  [DeriveTraceTargets],
  ([command]) => {
    const keys = targetKeysOf(command)
    const firstRepeat = keys.find((key, index) => keys.slice(0, index).includes(key))
    return Result.match(deriveTraceTargets(command), {
      onFailure: (refused) =>
        firstRepeat !== undefined && Schema.is(DuplicateTraceTarget)(refused) &&
        keyOf(refused.packId, refused.taskId) === firstRepeat,
      onSuccess: (decision) =>
        firstRepeat === undefined &&
        (Schema.is(TraceTargetsDerived)(decision)
          ? producedKeysMatch(decision.targets.map((target) => keyOf(target.packId, target.taskId)), keys)
          : Schema.is(NothingToTrace)(decision) && keys.length === 0 &&
            decision.taskCount === command.tasks.tasks.length &&
            decision.packCount === command.packs.length),
    })
  },
)

const producedKeysMatch = (produced: ReadonlyArray<string>, keys: ReadonlyArray<string>): boolean =>
  produced.length === keys.length && new Set(produced).size === produced.length &&
  keys.every((key) => produced.includes(key))

it.prop(
  '∀c_repeatedPackId_≡RefusedNamingTheRepeatedPair',
  [Pack, Schema.NonEmptyArray(Task)],
  ([pack, tasks]) => {
    const command = new DeriveTraceTargets({ tasks: new TaskSet({ version: 1, tasks }), packs: [pack, pack] })
    const keys = targetKeysOf(command)
    const firstRepeat = keys.find((key, index) => keys.slice(0, index).includes(key))
    if (firstRepeat === undefined) return false
    return Result.match(deriveTraceTargets(command), {
      onFailure: (refused) =>
        Schema.is(DuplicateTraceTarget)(refused) && keyOf(refused.packId, refused.taskId) === firstRepeat,
      onSuccess: () => false,
    })
  },
)

it.prop(
  '∀c_sameCommand_≡SameDecisionTwice',
  [DeriveTraceTargets],
  ([command]) => Equal.equals(deriveTraceTargets(command), deriveTraceTargets(command)),
)
