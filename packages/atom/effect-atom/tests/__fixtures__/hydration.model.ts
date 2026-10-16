import { Match, Schema } from 'effect'

export const HydrationCommand = Schema.Union([
  Schema.TaggedStruct('Save', {}),
  Schema.TaggedStruct('Reload', {}),
  Schema.TaggedStruct('Resolve', {}),
  Schema.TaggedStruct('Read', {}),
])

export type HydrationCommand = Schema.Schema.Type<typeof HydrationCommand>

export const HydrationState = Schema.Struct({
  saved: Schema.Boolean,
  reloaded: Schema.Boolean,
  resolved: Schema.Boolean,
})

export type HydrationState = Schema.Schema.Type<typeof HydrationState>

export const initialHydrationState: HydrationState = { saved: false, reloaded: false, resolved: false }

const mayRun = (state: HydrationState, command: HydrationCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Save', () => !state.saved),
    Match.tag('Reload', () => state.saved && !state.reloaded),
    Match.tag('Resolve', () => state.reloaded && !state.resolved),
    Match.tag('Read', () => state.reloaded),
    Match.exhaustive,
  )

const stepped = (
  state: HydrationState,
  command: HydrationCommand,
): readonly [HydrationState, ReadonlyArray<number> | undefined] =>
  Match.value(command).pipe(
    Match.tag(
      'Save',
      (): readonly [HydrationState, ReadonlyArray<number> | undefined] => [{ ...state, saved: true }, [1]],
    ),
    Match.tag(
      'Reload',
      (): readonly [HydrationState, ReadonlyArray<number> | undefined] => [{ ...state, reloaded: true }, undefined],
    ),
    Match.tag(
      'Resolve',
      (): readonly [HydrationState, ReadonlyArray<number> | undefined] => [{ ...state, resolved: true }, [42]],
    ),
    Match.tag(
      'Read',
      (): readonly [HydrationState, ReadonlyArray<number> | undefined] => [state, state.resolved ? [42] : []],
    ),
    Match.exhaustive,
  )

export const hydrationModel = {
  state: HydrationState,
  initial: initialHydrationState,
  precondition: mayRun,
  step: stepped,
}
