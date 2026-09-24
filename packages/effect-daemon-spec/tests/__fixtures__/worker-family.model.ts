import { Match, Schema } from 'effect'

export const WorkerFamilyCommand = Schema.Union([
  Schema.TaggedStruct('StartWorker', {}),
  Schema.TaggedStruct('StopWorker', {}),
  Schema.TaggedStruct('ReadRunning', {}),
])
export type WorkerFamilyCommand = Schema.Schema.Type<typeof WorkerFamilyCommand>

export const WorkerFamilyState = Schema.Struct({ running: Schema.Int })
export type WorkerFamilyState = Schema.Schema.Type<typeof WorkerFamilyState>

const stepped = (
  state: WorkerFamilyState,
  command: WorkerFamilyCommand,
): readonly [WorkerFamilyState, number] =>
  Match.value(command).pipe(
    Match.tag('StartWorker', () => {
      const running = state.running + 1
      return [{ running }, running] as const
    }),
    Match.tag('StopWorker', () => {
      const running = state.running - 1
      return [{ running }, running] as const
    }),
    Match.tag('ReadRunning', () => [state, state.running] as const),
    Match.exhaustive,
  )

const mayRun = (state: WorkerFamilyState, command: WorkerFamilyCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('StopWorker', () => state.running > 0),
    Match.orElse(() => true),
  )

export const workerFamilyModel = {
  state: WorkerFamilyState,
  initial: { running: 0 } satisfies WorkerFamilyState,
  precondition: mayRun,
  step: stepped,
}
