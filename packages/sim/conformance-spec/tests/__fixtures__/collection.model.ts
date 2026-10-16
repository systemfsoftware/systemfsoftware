import { Equal, Match, Schema } from 'effect'

export const CollectionCommand = Schema.Union([
  Schema.TaggedStruct('Push', { value: Schema.Literals([1, 2, 3]) }),
  Schema.TaggedStruct('InsertAt', { index: Schema.Literals([0, 1, 2, 3]), value: Schema.Literals([1, 2, 3]) }),
  Schema.TaggedStruct('Remove', {}),
])

export type CollectionCommand = Schema.Schema.Type<typeof CollectionCommand>

export const RemoveCommand = Schema.TaggedStruct('Remove', {})

export const CollectionState = Schema.Struct({ items: Schema.Array(Schema.Finite) })

export type CollectionState = Schema.Schema.Type<typeof CollectionState>

export const initialCollectionState: CollectionState = { items: [] }

const REFUSED_REMOVE_RESPONSE = -1

const collectionPrecondition = (state: CollectionState, command: CollectionCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Push', () => true),
    Match.tag('InsertAt', (at) => at.index <= state.items.length),
    Match.tag('Remove', () => state.items.length > 0),
    Match.exhaustive,
  )

const stepCollection = (
  state: CollectionState,
  command: CollectionCommand,
): readonly [CollectionState, number | undefined] =>
  Match.value(command).pipe(
    Match.tag('Push', (push) => appended(state, push.value)),
    Match.tag('InsertAt', (at) => spliced(state, at.index, at.value)),
    Match.tag('Remove', () => dropped(state)),
    Match.exhaustive,
  )

const appended = (state: CollectionState, value: number): readonly [CollectionState, number] => [
  { items: [...state.items, value] },
  state.items.length + 1,
]

const spliced = (state: CollectionState, index: number, value: number): readonly [CollectionState, number] => [
  { items: [...state.items.slice(0, index), value, ...state.items.slice(index)] },
  state.items.length + 1,
]

const dropped = (state: CollectionState): readonly [CollectionState, number] => {
  const last = state.items[state.items.length - 1]
  return last === undefined ? [{ items: [] }, REFUSED_REMOVE_RESPONSE] : [{ items: state.items.slice(0, -1) }, last]
}

export const collectionModel = {
  state: CollectionState,
  initial: initialCollectionState,
  precondition: collectionPrecondition,
  step: stepCollection,
}

export const removeOnlyModel = {
  state: CollectionState,
  initial: initialCollectionState,
  precondition: (state: CollectionState) => state.items.length > 0,
  step: (state: CollectionState): readonly [CollectionState, number | undefined] => dropped(state),
}

export interface CollectionObservation {
  readonly command: CollectionCommand
  readonly response: number | undefined
}

interface CollectionTrace {
  readonly state: CollectionState
  readonly response: number | undefined
}

const nextTrace = (traces: ReadonlyArray<CollectionTrace>, command: CollectionCommand): CollectionTrace => {
  const current = traces[traces.length - 1]
  const [state, response] = stepCollection(current === undefined ? initialCollectionState : current.state, command)
  return { state, response }
}

const collectionTrace = (observations: ReadonlyArray<CollectionObservation>): ReadonlyArray<CollectionTrace> =>
  observations.reduce<ReadonlyArray<CollectionTrace>>(
    (traces, observation) => [...traces, nextTrace(traces, observation.command)],
    [],
  )

const indexOfStep = (step: number | undefined): number => (step ?? 0) - 1

const stateBefore = (observations: ReadonlyArray<CollectionObservation>, step: number | undefined): CollectionState => {
  const previous = collectionTrace(observations)[indexOfStep(step) - 1]
  return previous === undefined ? initialCollectionState : previous.state
}

const firstDivergence = (observations: ReadonlyArray<CollectionObservation>): number | undefined => {
  const traces = collectionTrace(observations)
  const at = traces.findIndex((trace, index) => !Equal.equals(trace.response, observations[index]?.response))
  return at < 0 ? undefined : at + 1
}

const endIndexInsertion = (observations: ReadonlyArray<CollectionObservation>, step: number | undefined): boolean => {
  const command = observations[indexOfStep(step)]?.command
  return endedAt(stateBefore(observations, step), command)
}

const endedAt = (state: CollectionState, command: CollectionCommand | undefined): boolean =>
  command === undefined
    ? false
    : Match.value(command).pipe(
      Match.tag('InsertAt', (at) => at.index === state.items.length),
      Match.orElse(() => false),
    )

export const collectionOracle = {
  firstDivergence,
  endIndexInsertion,
}
