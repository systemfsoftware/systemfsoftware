import { Schema as S } from 'effect'
import { BODY_CHARS, HEAD_CHARS, TASK_ID_PATTERN } from './task-id.kernel.js'
import { TASK_NAME_PATTERN } from './task-name.kernel.js'

export const TaskId = S.String.pipe(
  S.pattern(TASK_ID_PATTERN),
  S.brand('TaskId'),
)
export type TaskId = S.Schema.Type<typeof TaskId>

export const TaskName = S.String.pipe(
  S.pattern(TASK_NAME_PATTERN),
  S.brand('TaskName'),
)
export type TaskName = S.Schema.Type<typeof TaskName>

export const ProjectName = S.NonEmptyString.pipe(S.brand('ProjectName'))
export type ProjectName = S.Schema.Type<typeof ProjectName>

export const ContainerName = S.String.pipe(
  S.pattern(new RegExp(`^.+-(?:cli|web|run|toad)-[${HEAD_CHARS}][0-9][${BODY_CHARS}]{3}$`)),
  S.brand('ContainerName'),
)
export type ContainerName = S.Schema.Type<typeof ContainerName>

export const TaskMode = S.Literal('cli', 'web', 'run', 'toad')
export type TaskMode = S.Schema.Type<typeof TaskMode>

export const EffectiveStatus = S.Literal(
  'deleting',
  'running',
  'init',
  'starting',
  'stopped',
  'completed',
  'failed',
  'created',
  'not found',
)
export type EffectiveStatus = S.Schema.Type<typeof EffectiveStatus>

export const ContainerLiveState = S.Struct({
  state: S.String,
  exitCode: S.Option(S.Int),
})
export type ContainerLiveState = S.Schema.Type<typeof ContainerLiveState>

export const TaskMetadata = S.Struct({
  deleting: S.Boolean,
  initialised: S.Boolean,
  launchInFlight: S.Boolean,
  exitCode: S.Option(S.Int),
})
export type TaskMetadata = S.Schema.Type<typeof TaskMetadata>
