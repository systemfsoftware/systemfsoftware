import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import {
  type ContainerLiveState,
  ContainerLiveState as ContainerLiveStateSchema,
  type EffectiveStatus,
  EffectiveStatus as EffectiveStatusSchema,
  TaskId as TaskIdSchema,
  type TaskMetadata,
  TaskMetadata as TaskMetadataSchema,
} from './task.schema.js'

const DeriveEffectiveStatusCommandTypeId: unique symbol = Symbol.for(
  '@terok/task-lifecycle/DeriveEffectiveStatusCommand',
)
type DeriveEffectiveStatusCommandTypeId = typeof DeriveEffectiveStatusCommandTypeId

const EffectiveStatusTypeId: unique symbol = Symbol.for('@terok/task-lifecycle/EffectiveStatus')
type EffectiveStatusTypeId = typeof EffectiveStatusTypeId

export class DeriveEffectiveStatusCommand extends S.TaggedClass<DeriveEffectiveStatusCommand>()(
  'DeriveEffectiveStatusCommand',
  {
    taskId: TaskIdSchema,
    metadata: TaskMetadataSchema,
    container: S.Option(ContainerLiveStateSchema),
  },
) {
  readonly [DeriveEffectiveStatusCommandTypeId] = DeriveEffectiveStatusCommandTypeId
}

export class EffectiveStatusDecided extends S.TaggedClass<EffectiveStatusDecided>()(
  'EffectiveStatusDecided',
  {
    status: EffectiveStatusSchema,
  },
) {
  readonly [EffectiveStatusTypeId] = EffectiveStatusTypeId
}

export class UnknownContainerState extends S.TaggedError<UnknownContainerState>()(
  'UnknownContainerState',
  {
    state: S.String,
  },
) {
  readonly [EffectiveStatusTypeId] = EffectiveStatusTypeId
}

export type EffectiveStatusError = UnknownContainerState

export type EffectiveStatusEither = Either<EffectiveStatusDecided, EffectiveStatusError>

const runningStatus = (initialised: boolean): EffectiveStatus =>
  Match.value({ initialised }).pipe(
    Match.when({ initialised: true }, () => 'running' as const),
    Match.orElse(() => 'init' as const),
  )

const terminalStatus = (exitCode: number): EffectiveStatus =>
  Match.value({ exitCode }).pipe(
    Match.when({ exitCode: 0 }, () => 'completed' as const),
    Match.orElse(() => 'failed' as const),
  )

const exitedStatus = (exitCode: Option.Option<number>): EffectiveStatusEither =>
  Option.match(exitCode, {
    onNone: () => right(new EffectiveStatusDecided({ status: 'stopped' })),
    onSome: (code) => right(new EffectiveStatusDecided({ status: terminalStatus(code) })),
  })

const presentContainerStatus = (
  container: ContainerLiveState,
  initialised: boolean,
): EffectiveStatusEither =>
  Match.value(container).pipe(
    Match.when(
      { state: 'running' },
      () => right(new EffectiveStatusDecided({ status: runningStatus(initialised) })),
    ),
    Match.when({ state: 'created' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'restarting' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'exited' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'paused' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'dead' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'removing' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.when({ state: 'unknown' }, ({ exitCode }) => exitedStatus(exitCode)),
    Match.orElse(() => left(new UnknownContainerState({ state: container.state }))),
  )

const absentContainerStatus = (metadata: TaskMetadata): EffectiveStatusEither =>
  Match.value(metadata).pipe(
    Match.when(
      { launchInFlight: true },
      () => right(new EffectiveStatusDecided({ status: 'starting' })),
    ),
    Match.when(
      { initialised: false },
      () => right(new EffectiveStatusDecided({ status: 'created' })),
    ),
    Match.when(
      (m) => Option.isSome(m.exitCode),
      (m) => exitedStatus(m.exitCode),
    ),
    Match.orElse(() => right(new EffectiveStatusDecided({ status: 'not found' }))),
  )

const derive = (command: DeriveEffectiveStatusCommand): EffectiveStatusEither =>
  Option.match(command.container, {
    onNone: () => absentContainerStatus(command.metadata),
    onSome: (container) => presentContainerStatus(container, command.metadata.initialised),
  })

export const deriveEffectiveStatus: Workflow<
  DeriveEffectiveStatusCommand,
  EffectiveStatusDecided,
  EffectiveStatusError
> = (command: DeriveEffectiveStatusCommand): Either<EffectiveStatusDecided, UnknownContainerState> =>
  Match.value(command).pipe(
    Match.when(
      { metadata: { deleting: true } },
      () => right(new EffectiveStatusDecided({ status: 'deleting' })),
    ),
    Match.orElse(() => derive(command)),
  )
