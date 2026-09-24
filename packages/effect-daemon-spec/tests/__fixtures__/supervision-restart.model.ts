import { Match, Schema } from 'effect'

export const SupervisionFamily = Schema.Literals(['one_for_one', 'rest_for_one'])
export type SupervisionFamily = Schema.Schema.Type<typeof SupervisionFamily>

export const SupervisionRestartCommand = Schema.Union([
  Schema.TaggedStruct('FailChild', { index: Schema.Literals([0, 1, 2]) }),
])
export type SupervisionRestartCommand = Schema.Schema.Type<typeof SupervisionRestartCommand>

export const SupervisionRestartState = Schema.Struct({ starts: Schema.Array(Schema.Int), first: Schema.Int })
export type SupervisionRestartState = Schema.Schema.Type<typeof SupervisionRestartState>

const FAMILY_SIZE = 3

const restartedBy = (family: SupervisionFamily, index: number): ReadonlyArray<number> =>
  family === 'one_for_one'
    ? [index]
    : Array.from({ length: FAMILY_SIZE - index }, (_, offset) => index + offset)

const firstRunningAfter = (family: SupervisionFamily, index: number): number => family === 'rest_for_one' ? index : 0

const mayRun = (state: SupervisionRestartState, command: SupervisionRestartCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('FailChild', ({ index }) => index >= state.first),
    Match.exhaustive,
  )

const modelFor = (family: SupervisionFamily) => ({
  state: SupervisionRestartState,
  initial: { starts: [1, 1, 1], first: 0 } satisfies SupervisionRestartState,
  precondition: mayRun,
  step: (
    state: SupervisionRestartState,
    command: SupervisionRestartCommand,
  ): readonly [SupervisionRestartState, ReadonlyArray<number>] =>
    Match.value(command).pipe(
      Match.tag('FailChild', ({ index }) => {
        const restarted = restartedBy(family, index)
        const starts = state.starts.map((value, position) => restarted.includes(position) ? value + 1 : value)
        return [{ starts, first: firstRunningAfter(family, index) }, starts] as const
      }),
      Match.exhaustive,
    ),
})

export const supervisionRestart = {
  restartedBy,
  oneForOneModel: modelFor('one_for_one'),
  restForOneModel: modelFor('rest_for_one'),
} as const
