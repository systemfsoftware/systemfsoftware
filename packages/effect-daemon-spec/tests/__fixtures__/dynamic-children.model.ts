import { Match, Schema } from 'effect'

export const DynamicChildrenCommand = Schema.Union([
  Schema.TaggedStruct('StartChild', {}),
  Schema.TaggedStruct('StopChild', {}),
  Schema.TaggedStruct('StopUnknownChild', {}),
  Schema.TaggedStruct('ReadCount', {}),
])
export type DynamicChildrenCommand = Schema.Schema.Type<typeof DynamicChildrenCommand>

export const DynamicChildrenState = Schema.Struct({ active: Schema.Int })
export type DynamicChildrenState = Schema.Schema.Type<typeof DynamicChildrenState>

const stepped = (
  state: DynamicChildrenState,
  command: DynamicChildrenCommand,
): readonly [DynamicChildrenState, number] =>
  Match.value(command).pipe(
    Match.tag('StartChild', () => {
      const active = state.active + 1
      return [{ active }, active] as const
    }),
    Match.tag('StopChild', () => {
      const active = state.active - 1
      return [{ active }, active] as const
    }),
    Match.tag('StopUnknownChild', () => [state, state.active] as const),
    Match.tag('ReadCount', () => [state, state.active] as const),
    Match.exhaustive,
  )

const mayRun = (state: DynamicChildrenState, command: DynamicChildrenCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('StopChild', () => state.active > 0),
    Match.orElse(() => true),
  )

export const dynamicChildrenModel = {
  state: DynamicChildrenState,
  initial: { active: 0 } satisfies DynamicChildrenState,
  precondition: mayRun,
  step: stepped,
}
