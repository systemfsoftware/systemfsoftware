import { describe, it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Arbitrary, FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import * as S from 'effect/Schema'
import {
  resolveTask,
  ResolveTaskCommand,
  type ResolveTaskEither,
  ResolveTaskError,
  TaskAmbiguous,
  TaskResolved,
} from '../task-resolution.workflow.js'
import { ContainerName, ProjectName, type TaskId, TaskId as TaskIdSchema } from '../task.schema.js'

const project = S.decodeUnknownSync(ProjectName)('demo')

refutes(ProjectName, {
  Empty: fc.constant(''),
})

refutes(ContainerName, {
  NotShape: fc.constantFrom('garbage', 'a-cli-xxxxx', ''),
})

refutes(ResolveTaskCommand, {
  EmptyProject: fc.record({
    _tag: fc.constant('ResolveTaskCommand'),
    project: fc.constant(''),
    input: fc.string(),
    candidates: fc.constant([]),
  }),
  BadCandidate: fc.record({
    _tag: fc.constant('ResolveTaskCommand'),
    project: fc.constant('demo'),
    input: fc.string(),
    candidates: fc.array(fc.constant('BAD'), { maxLength: 3, minLength: 1 }),
  }),
})

refutes(TaskResolved, {
  BadTaskId: fc.record({ _tag: fc.constant('TaskResolved'), taskId: fc.constant('AAAAA') }),
})

refutes(ResolveTaskError, {
  EmptyProject: fc.record({
    _tag: fc.constant('TaskNotFound'),
    project: fc.constant(''),
    prefix: fc.constant(''),
  }),
  BadCandidate: fc.record({
    _tag: fc.constant('TaskAmbiguous'),
    prefix: fc.constant('x'),
    matches: fc.array(fc.constant('BAD'), { maxLength: 3, minLength: 1 }),
  }),
})

const commandOf = (input: string, candidates: ReadonlyArray<TaskId>): ResolveTaskCommand =>
  new ResolveTaskCommand({ project, input, candidates })

const withHyphens = (value: string): string => `${value.slice(0, 2)}-${value.slice(2)}`

const resolvedIdOf = (result: ResolveTaskEither): string | null =>
  Either.match(result, {
    onLeft: () => null,
    onRight: (resolved) => resolved.taskId,
  })

const errorTagOf = (result: ResolveTaskEither): string | null =>
  Either.match(result, {
    onLeft: (error) => error._tag,
    onRight: () => null,
  })

const matchesOf = (result: ResolveTaskEither): string | null =>
  Either.match(result, {
    onLeft: (error) => (S.is(TaskAmbiguous)(error) ? error.matches.join(',') : null),
    onRight: () => null,
  })

describe('task-resolution workflow — prefix resolution', () => {
  it.prop(
    '∀c_Command_=Exact',
    [TaskIdSchema, fc.array(Arbitrary.make(TaskIdSchema), { maxLength: 5 })],
    ([id, extras]) => resolvedIdOf(resolveTask(commandOf(withHyphens(id.toUpperCase()), [id, ...extras]))) === id,
  )

  it.prop(
    '∀c_Command_=Prefix',
    [TaskIdSchema, fc.integer({ min: 1, max: 5 })],
    ([id, n]) => resolvedIdOf(resolveTask(commandOf(id.slice(0, n), [id]))) === id,
  )

  it.prop(
    '∀c_Command_→NotFound',
    [TaskIdSchema, fc.integer({ min: 1, max: 5 })],
    ([id, n]) => errorTagOf(resolveTask(commandOf(id.slice(0, n), []))) === 'TaskNotFound',
  )

  it.prop('∀c_Command_→Ambiguous', [TaskIdSchema], ([id]) => {
    const prefix = id.slice(0, 2)
    const first = S.decodeUnknownSync(TaskIdSchema)(`${prefix}012`)
    const second = S.decodeUnknownSync(TaskIdSchema)(`${prefix}345`)
    const result = resolveTask(commandOf(prefix, [second, first]))
    return errorTagOf(result) === 'TaskAmbiguous' && matchesOf(result) === `${first},${second}`
  })

  it.prop('∀c_Command_→InvalidPrefix', [
    fc.oneof(
      fc.constant(''),
      fc.stringMatching(/^[0-9]{5}$/),
      fc.stringMatching(/^[a-hjkmnp-tv-z][a-z]{5}$/),
    ),
  ], ([input]) => errorTagOf(resolveTask(commandOf(input, []))) === 'InvalidPrefix')

  it.prop(
    '∀c_Command_→InvalidHead',
    [fc.constantFrom('i3v8h', 'l3v8h', 'o3v8h', 'I3V8H')],
    ([input]) => errorTagOf(resolveTask(commandOf(input, []))) === 'InvalidHeadLetter',
  )
})
