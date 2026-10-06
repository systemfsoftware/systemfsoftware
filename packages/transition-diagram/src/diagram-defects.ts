import { Array as Arr, HashSet, Option, Order } from 'effect'
import {
  DanglingTransitionSource,
  DanglingTransitionTarget,
  type DiagramShapeInvalid,
  DuplicateStateId,
  MissingInitialState,
} from './DiagramDefect.schema.js'
import type { DiagramTransition, StateId, TransitionDiagram } from './TransitionDiagram.schema.js'

export type DiagramDefect =
  | DiagramShapeInvalid
  | DuplicateStateId
  | DanglingTransitionSource
  | DanglingTransitionTarget
  | MissingInitialState

const occurrenceCountOf = (ids: ReadonlyArray<StateId>, id: StateId): number =>
  Arr.filter(ids, (candidate) => candidate === id).length

const duplicatedIdsOf = (ids: ReadonlyArray<StateId>): ReadonlyArray<StateId> =>
  Arr.sort(Order.String)(Arr.filter(Arr.dedupe(ids), (id) => occurrenceCountOf(ids, id) > 1))

const danglingSourcesOf = (
  known: HashSet.HashSet<StateId>,
  transitions: ReadonlyArray<DiagramTransition>,
): ReadonlyArray<DiagramDefect> =>
  Arr.map(
    Arr.filter(transitions, (transition) => !HashSet.has(known, transition.from)),
    (transition) => DanglingTransitionSource.make({ from: transition.from, to: transition.to }),
  )

const danglingTargetsOf = (
  known: HashSet.HashSet<StateId>,
  transitions: ReadonlyArray<DiagramTransition>,
): ReadonlyArray<DiagramDefect> =>
  Arr.map(
    Arr.filter(transitions, (transition) => !HashSet.has(known, transition.to)),
    (transition) => DanglingTransitionTarget.make({ from: transition.from, to: transition.to }),
  )

const missingInitialOf = (diagram: TransitionDiagram): ReadonlyArray<DiagramDefect> =>
  Option.match(Arr.findFirst(diagram.states, (state) => state.kind === 'initial'), {
    onNone: () => [MissingInitialState.make({})],
    onSome: () => [],
  })

export const defectsOf = (diagram: TransitionDiagram): ReadonlyArray<DiagramDefect> => {
  const ids = Arr.map(diagram.states, (state) => state.id)
  const known = HashSet.fromIterable(ids)
  return [
    ...Arr.map(duplicatedIdsOf(ids), (id) => DuplicateStateId.make({ id })),
    ...danglingSourcesOf(known, diagram.transitions),
    ...danglingTargetsOf(known, diagram.transitions),
    ...missingInitialOf(diagram),
  ]
}
