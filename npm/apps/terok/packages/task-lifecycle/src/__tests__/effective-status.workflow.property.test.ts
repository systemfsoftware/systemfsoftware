import { describe, it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import {
  deriveEffectiveStatus,
  DeriveEffectiveStatusCommand,
  type EffectiveStatusEither,
  UnknownContainerState,
} from '../effective-status.workflow.js'
import {
  type ContainerLiveState,
  ContainerLiveState as ContainerLiveStateSchema,
  TaskId,
  TaskMetadata,
  type TaskMetadata as TaskMetadataT,
} from '../task.schema.js'

const taskId = S.decodeUnknownSync(TaskId)('k3v8h')

refutes(ContainerLiveStateSchema, {
  OptionInstanceExitCode: fc.record({
    state: fc.string(),
    exitCode: fc.constant(Option.some(0)),
  }),
})

refutes(TaskMetadata, {
  OptionInstanceExitCode: fc.record({
    deleting: fc.boolean(),
    initialised: fc.boolean(),
    launchInFlight: fc.boolean(),
    exitCode: fc.constant(Option.some(0)),
  }),
})

refutes(DeriveEffectiveStatusCommand, {
  ClassInstanceContainer: fc
    .record({ state: fc.string(), exitCode: fc.constant(Option.none()) })
    .map((container) =>
      new DeriveEffectiveStatusCommand({
        taskId,
        metadata: { deleting: true, initialised: false, launchInFlight: true, exitCode: Option.none() },
        container: Option.some(container),
      })
    ),
  BadTaskId: fc.record({
    _tag: fc.constant('DeriveEffectiveStatusCommand'),
    taskId: fc.constant('AAAAA'),
    metadata: fc.record({
      deleting: fc.boolean(),
      initialised: fc.boolean(),
      launchInFlight: fc.boolean(),
      exitCode: fc.constant({ _tag: 'None' }),
    }),
    container: fc
      .record({ state: fc.string(), exitCode: fc.constant({ _tag: 'None' }) })
      .map((value) => ({ _tag: 'Some', value })),
  }),
})

const commandOf = (
  metadata: TaskMetadataT,
  container: Option.Option<ContainerLiveState>,
): DeriveEffectiveStatusCommand => new DeriveEffectiveStatusCommand({ taskId, metadata, container })

const running = Option.some({ state: 'running', exitCode: Option.none() })

const exited = (exitCode: Option.Option<number>): Option.Option<ContainerLiveState> =>
  Option.some({ state: 'exited', exitCode })

const statusOf = (result: EffectiveStatusEither): string | null =>
  Either.match(result, {
    onLeft: () => null,
    onRight: (decided) => decided.status,
  })

const isUnknownContainerState = (result: EffectiveStatusEither): boolean =>
  Either.match(result, {
    onLeft: (error) => S.is(UnknownContainerState)(error),
    onRight: () => false,
  })

describe('effective-status workflow — status derivation', () => {
  it.prop(
    '∀c_Command_→Deleting',
    [DeriveEffectiveStatusCommand],
    ([c]) => statusOf(deriveEffectiveStatus(commandOf({ ...c.metadata, deleting: true }, c.container))) === 'deleting',
  )

  it.prop('∀c_Command_→Running', [DeriveEffectiveStatusCommand], ([c]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...c.metadata, deleting: false, initialised: true },
      running,
    ))) === 'running')

  it.prop('∀c_Command_→Init', [DeriveEffectiveStatusCommand], ([c]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...c.metadata, deleting: false, initialised: false },
      running,
    ))) === 'init')

  it.prop('∀c_Command_→Stopped', [DeriveEffectiveStatusCommand], ([c]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...c.metadata, deleting: false },
      exited(Option.none()),
    ))) === 'stopped')

  it.prop('∀c_Command_→Completed', [DeriveEffectiveStatusCommand], ([c]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...c.metadata, deleting: false },
      exited(Option.some(0)),
    ))) === 'completed')

  it.prop(
    '∀c_Command_→Failed',
    [DeriveEffectiveStatusCommand, fc.integer({ min: 1, max: 255 })],
    ([c, code]) =>
      statusOf(deriveEffectiveStatus(commandOf(
        { ...c.metadata, deleting: false },
        exited(Option.some(code)),
      ))) === 'failed',
  )

  it.prop('∀m_Meta_→Starting', [TaskMetadata], ([m]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...m, deleting: false, launchInFlight: true, initialised: false },
      Option.none(),
    ))) === 'starting')

  it.prop('∀m_Meta_→Created', [TaskMetadata], ([m]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...m, deleting: false, launchInFlight: false, initialised: false, exitCode: Option.none() },
      Option.none(),
    ))) === 'created')

  it.prop('∀m_Meta_→Completed', [TaskMetadata], ([m]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...m, deleting: false, launchInFlight: false, initialised: true, exitCode: Option.some(0) },
      Option.none(),
    ))) === 'completed')

  it.prop(
    '∀m_Meta_→Failed',
    [TaskMetadata, fc.integer({ min: 1, max: 255 })],
    ([m, code]) =>
      statusOf(deriveEffectiveStatus(commandOf(
        { ...m, deleting: false, launchInFlight: false, initialised: true, exitCode: Option.some(code) },
        Option.none(),
      ))) === 'failed',
  )

  it.prop('∀m_Meta_→NotFound', [TaskMetadata], ([m]) =>
    statusOf(deriveEffectiveStatus(commandOf(
      { ...m, deleting: false, launchInFlight: false, initialised: true, exitCode: Option.none() },
      Option.none(),
    ))) === 'not found')

  it.prop('∀s_ContainerState_→UnknownError', [
    DeriveEffectiveStatusCommand,
    fc.stringMatching(/^[A-Z]{1,16}$/),
  ], ([c, state]) =>
    isUnknownContainerState(deriveEffectiveStatus(commandOf(
      { ...c.metadata, deleting: false },
      Option.some({ state, exitCode: Option.none() }),
    ))))
})
