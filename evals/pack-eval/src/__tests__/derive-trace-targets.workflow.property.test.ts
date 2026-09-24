import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  DeriveTraceTargets,
  deriveTraceTargets,
  DuplicateTraceTarget,
  NothingToTrace,
  TraceTargetsDerived,
} from '../derive-trace-targets.workflow.js'
import { Pack, PackRule } from '../pack-rule.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'

const ruleOf = (packId: string, stem: string): PackRule =>
  new PackRule({
    packId: `rule-${packId === '' ? 'empty' : packId}`,
    stem,
    title: `Rule ${stem}`,
    appliesWhen: ['always'],
    tags: ['example'],
    body: 'a body',
  })

const packOf = (packId: string): Pack =>
  new Pack({ id: `pack-${packId === '' ? 'empty' : packId}`, rules: [ruleOf(packId, 'alpha')] })

const taskOf = (taskId: string): Task =>
  new Task({
    id: `task-${taskId === '' ? 'empty' : taskId}`,
    text: `task ${taskId}`,
    split: 'dev',
    dimensions: { job: 'watering' },
  })

const commandOf = (taskCount: number, packCount: number): DeriveTraceTargets =>
  new DeriveTraceTargets({
    tasks: new TaskSet({ version: 1, tasks: Array.from({ length: taskCount }, (_, index) => taskOf(`task-${index}`)) }),
    packs: Array.from({ length: packCount }, (_, index) => packOf(`pack-${index}`)),
  })
it.prop('∀p_TaskPackPairs_≡OneTargetEach', [Schema.Int], ([draw]) => {
  const command = commandOf(1 + (Math.abs(draw) % 3), 1 + (Math.abs(draw) % 3))
  const decided = Result.getOrThrow(deriveTraceTargets(command))
  const expected = new TraceTargetsDerived({
    targets: command.packs.flatMap((pack) =>
      command.tasks.tasks.map((task) => ({
        _tag: 'TraceTarget',
        packId: pack.id,
        taskId: task.id,
      }))
    ),
  })
  return Schema.is(TraceTargetsDerived)(decided) &&
    Equal.equals(decided, expected) &&
    decided.targets.length === command.tasks.tasks.length * command.packs.length
})

it.prop('∀d_DuplicatePackId_≡RefusedNamingPair', [Schema.String, Schema.String], ([packId, taskId]) => {
  const outcome = deriveTraceTargets(
    new DeriveTraceTargets({
      tasks: new TaskSet({ version: 1, tasks: [taskOf(taskId)] }),
      packs: [packOf(packId), packOf(packId)],
    }),
  )
  return Result.isFailure(outcome) &&
    Schema.is(DuplicateTraceTarget)(outcome.failure) &&
    outcome.failure.packId === `pack-${packId === '' ? 'empty' : packId}` &&
    outcome.failure.taskId === `task-${taskId === '' ? 'empty' : taskId}`
})
it.prop('∀e_EmptyTaskSet_≡NothingToTrace', [Schema.Int], ([draw]) => {
  const command = commandOf(0, 1 + (Math.abs(draw) % 3))
  const decided = Result.getOrThrow(deriveTraceTargets(command))
  const expected = new NothingToTrace({ taskCount: 0, packCount: command.packs.length })
  return Schema.is(NothingToTrace)(decided) && Equal.equals(decided, expected)
})
