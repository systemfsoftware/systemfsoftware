import { Match, Schema } from 'effect'

export const CollectionCommand = Schema.Union([
  Schema.TaggedStruct('Push', { value: Schema.Literals([1, 2, 3]) }),
  Schema.TaggedStruct('InsertAt', { index: Schema.Literals([0, 1, 2, 3]), value: Schema.Literals([1, 2, 3]) }),
  Schema.TaggedStruct('RemoveAt', { index: Schema.Literals([0, 1, 2, 3]) }),
])

export type CollectionCommand = Schema.Schema.Type<typeof CollectionCommand>

export const CollectionState = Schema.Struct({ items: Schema.Array(Schema.Finite) })

export type CollectionState = Schema.Schema.Type<typeof CollectionState>

export const initialCollectionState: CollectionState = { items: [] }

const mayRun = (state: CollectionState, command: CollectionCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Push', () => true),
    Match.tag('InsertAt', (at) => at.index <= state.items.length),
    Match.tag('RemoveAt', (at) => at.index < state.items.length),
    Match.exhaustive,
  )

const appended = (state: CollectionState, value: number): readonly [CollectionState, ReadonlyArray<number>] => {
  const items = [...state.items, value]
  return [{ items }, items]
}

const inserted = (
  state: CollectionState,
  index: number,
  value: number,
): readonly [CollectionState, ReadonlyArray<number>] => {
  const items = [...state.items.slice(0, index), value, ...state.items.slice(index)]
  return [{ items }, items]
}

const removedAt = (state: CollectionState, index: number): readonly [CollectionState, ReadonlyArray<number>] => {
  const items = [...state.items.slice(0, index), ...state.items.slice(index + 1)]
  return [{ items }, items]
}

const stepped = (
  state: CollectionState,
  command: CollectionCommand,
): readonly [CollectionState, ReadonlyArray<number>] =>
  Match.value(command).pipe(
    Match.tag('Push', (push) => appended(state, push.value)),
    Match.tag('InsertAt', (at) => inserted(state, at.index, at.value)),
    Match.tag('RemoveAt', (at) => removedAt(state, at.index)),
    Match.exhaustive,
  )

export const collectionModel = {
  state: CollectionState,
  initial: initialCollectionState,
  precondition: mayRun,
  step: stepped,
}
