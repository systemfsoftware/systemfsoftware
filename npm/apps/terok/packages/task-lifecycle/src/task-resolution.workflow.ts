import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { isTaskIdPrefixShape, normalizeTaskIdInput, stripTaskIdHyphens } from './task-id.kernel.js'
import { ProjectName as ProjectNameSchema, type TaskId, TaskId as TaskIdSchema } from './task.schema.js'

const ResolveTaskTypeId: unique symbol = Symbol.for('@terok/task-lifecycle/ResolveTask')
type ResolveTaskTypeId = typeof ResolveTaskTypeId

export class ResolveTaskCommand extends S.TaggedClass<ResolveTaskCommand>()('ResolveTaskCommand', {
  project: ProjectNameSchema,
  input: S.String,
  candidates: S.Array(TaskIdSchema),
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export class TaskResolved extends S.TaggedClass<TaskResolved>()('TaskResolved', {
  taskId: TaskIdSchema,
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export class InvalidHeadLetter extends S.TaggedError<InvalidHeadLetter>()('InvalidHeadLetter', {
  prefix: S.String,
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export class InvalidPrefix extends S.TaggedError<InvalidPrefix>()('InvalidPrefix', {
  prefix: S.String,
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export class TaskNotFound extends S.TaggedError<TaskNotFound>()('TaskNotFound', {
  project: ProjectNameSchema,
  prefix: S.String,
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export class TaskAmbiguous extends S.TaggedError<TaskAmbiguous>()('TaskAmbiguous', {
  prefix: S.String,
  matches: S.Array(TaskIdSchema),
}) {
  readonly [ResolveTaskTypeId] = ResolveTaskTypeId
}

export const ResolveTaskError = S.Union(
  InvalidHeadLetter,
  InvalidPrefix,
  TaskNotFound,
  TaskAmbiguous,
)
export type ResolveTaskError = S.Schema.Type<typeof ResolveTaskError>

export type ResolveTaskEither = Either<TaskResolved, ResolveTaskError>

const sortTaskIds = (matches: ReadonlyArray<TaskId>): ReadonlyArray<TaskId> => Array.from(matches).sort()

const decideByCount = (
  command: ResolveTaskCommand,
  prefix: string,
  matches: ReadonlyArray<TaskId>,
  taskId: TaskId,
): ResolveTaskEither =>
  Match.value({ count: matches.length } as const).pipe(
    Match.when(
      { count: 1 },
      () => right(new TaskResolved({ taskId })),
    ),
    Match.orElse(() => left(new TaskAmbiguous({ prefix, matches: sortTaskIds(matches) }))),
  )

const decideByMatches = (
  command: ResolveTaskCommand,
  prefix: string,
  matches: ReadonlyArray<TaskId>,
): ResolveTaskEither =>
  Option.match(Option.fromNullable(matches[0]), {
    onNone: () => left(new TaskNotFound({ project: command.project, prefix })),
    onSome: (taskId) => decideByCount(command, prefix, matches, taskId),
  })

const decideByPrefix = (command: ResolveTaskCommand, normalized: string): ResolveTaskEither => {
  const exact = Option.fromNullable(command.candidates.find((id) => id === normalized))
  const matches = command.candidates.filter((id) => id.startsWith(normalized))
  return Option.match(exact, {
    onNone: () => decideByMatches(command, command.input, matches),
    onSome: (taskId) => right(new TaskResolved({ taskId })),
  })
}

export const resolveTask: Workflow<ResolveTaskCommand, TaskResolved, ResolveTaskError> = (
  command: ResolveTaskCommand,
): Either<TaskResolved, InvalidHeadLetter | InvalidPrefix | TaskNotFound | TaskAmbiguous> => {
  const normalized = normalizeTaskIdInput(command.input)
  const headLetter = stripTaskIdHyphens(command.input).toLowerCase().charAt(0)
  const invalidPrefix = !isTaskIdPrefixShape(normalized)
  return Match.value({ headLetter, invalidPrefix } as const).pipe(
    Match.when(
      { headLetter: 'i' },
      () => left(new InvalidHeadLetter({ prefix: command.input })),
    ),
    Match.when(
      { headLetter: 'l' },
      () => left(new InvalidHeadLetter({ prefix: command.input })),
    ),
    Match.when(
      { headLetter: 'o' },
      () => left(new InvalidHeadLetter({ prefix: command.input })),
    ),
    Match.when(
      { invalidPrefix: true },
      () => left(new InvalidPrefix({ prefix: command.input })),
    ),
    Match.orElse(() => decideByPrefix(command, normalized)),
  )
}
