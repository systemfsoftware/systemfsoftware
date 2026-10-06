import { Array as Arr, Match, Option, Order } from 'effect'
import { createActor } from 'xstate'
import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine, Snapshot } from 'xstate'
import { type DirectedGraphNode, getShortestPaths, type StatePath, type Step, toDirectedGraph } from 'xstate/graph'
import { PathCoverageError, SnapshotRoundTripError } from './ModelTestError.schema.js'
import { asRawObject, isRawObject, type Raw, type RawObject } from './shape.js'

const INIT_EVENT = '@xstate.init'

export type ModelSnapshot = Snapshot<Raw>

export interface PathStep {
  readonly event: AnyEventObject
  readonly state: ModelSnapshot
}

export interface ShortestPath {
  readonly steps: ReadonlyArray<PathStep>
  readonly state: ModelSnapshot
  readonly weight: number
}

export interface ModelTestStore {
  readonly save: (snapshot: ModelSnapshot) => void
  readonly load: () => ModelSnapshot | undefined
}

export interface PathRun {
  readonly path: ShortestPath
  readonly state: string
  readonly persisted: ModelSnapshot
  readonly restored: ModelSnapshot
  readonly roundTripped: boolean
}

export interface MachineStructures {
  readonly states: ReadonlyArray<string>
  readonly transitions: ReadonlyArray<string>
}

export interface CoveredStructures {
  readonly states: ReadonlyArray<string>
  readonly transitions: ReadonlyArray<string>
}

export interface MachinePaths {
  readonly machine: AnyStateMachine
  readonly paths: ReadonlyArray<ShortestPath>
}

export interface MachineStore {
  readonly machine: AnyStateMachine
  readonly store: ModelTestStore
}

export interface PathRunInput {
  readonly machine: AnyStateMachine
  readonly path: ShortestPath
  readonly store: ModelTestStore
}

export interface MachineRuns {
  readonly machine: AnyStateMachine
  readonly runs: ReadonlyArray<PathRun>
}

export interface ModelTestReport {
  readonly runs: ReadonlyArray<PathRun>
  readonly uncovered: ReadonlyArray<string>
}

type GraphPath = StatePath<AnyMachineSnapshot, AnyEventObject>
type GraphStep = Step<AnyMachineSnapshot, AnyEventObject>

const leafOfStateValue = (value: Raw): string => typeof value === 'string' ? value : String(value)

const flattenStateValue = (value: Raw): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(asRawObject(value)), {
    onNone: () => [leafOfStateValue(value)],
    onSome: (object) =>
      Arr.flatMap(
        Object.entries(object),
        ([key, child]) => Arr.map(flattenStateValue(child), (leaf) => `${key}.${leaf}`),
      ),
  })

export const snapshotState = (snapshot: ModelSnapshot): string =>
  Arr.join(flattenStateValue(asRawObject(snapshot)?.['value']), '|')

const transitionKey = (source: string, event: string, target: string): string => `${source} --${event}--> ${target}`

export const shortestPaths = (machine: AnyStateMachine): ReadonlyArray<ShortestPath> =>
  Arr.map(
    getShortestPaths(machine),
    (path: GraphPath): ShortestPath => ({
      steps: Arr.map(path.steps, (step: GraphStep): PathStep => ({ event: step.event, state: step.state })),
      state: path.state,
      weight: path.weight,
    }),
  )

const collectDeclared = (node: DirectedGraphNode, states: Array<string>, transitions: Array<string>): void => {
  if (node.stateNode.path.length > 0) states.push(Arr.join(node.stateNode.path, '.'))
  Arr.forEach(
    node.edges,
    (edge) =>
      transitions.push(
        transitionKey(Arr.join(edge.source.path, '.'), edge.label.text, Arr.join(edge.target.path, '.')),
      ),
  )
  Arr.forEach(node.children, (child) => collectDeclared(child, states, transitions))
}

export const declaredStructures = (machine: AnyStateMachine): MachineStructures => {
  const states: Array<string> = []
  const transitions: Array<string> = []
  collectDeclared(toDirectedGraph(machine), states, transitions)
  return {
    states: Arr.sort(Arr.dedupe(states), Order.String),
    transitions: Arr.sort(Arr.dedupe(transitions), Order.String),
  }
}

export const coveredStructures = (paths: ReadonlyArray<ShortestPath>): CoveredStructures => {
  const states: Array<string> = []
  const transitions: Array<string> = []
  Arr.forEach(paths, (path) => {
    const keys = Arr.map(path.steps, (step) => snapshotState(step.state))
    Arr.forEach(keys, (key) => states.push(key))
    const events = Arr.map(Arr.drop(path.steps, 1), (step) => step.event.type)
    Arr.forEach(
      Arr.zip(Arr.zip(Arr.dropRight(keys, 1), Arr.drop(keys, 1)), events),
      ([[source, target], event]) => transitions.push(transitionKey(source, event, target)),
    )
  })
  return {
    states: Arr.sort(Arr.dedupe(states), Order.String),
    transitions: Arr.sort(Arr.dedupe(transitions), Order.String),
  }
}

export const uncoveredStructures = ({ machine, paths }: MachinePaths): ReadonlyArray<string> => {
  const declared = declaredStructures(machine)
  const covered = coveredStructures(paths)
  return [
    ...Arr.map(Arr.filter(declared.states, (id) => Arr.contains(covered.states, id) === false), (id) => `state ${id}`),
    ...Arr.map(
      Arr.filter(declared.transitions, (id) => Arr.contains(covered.transitions, id) === false),
      (id) => `transition ${id}`,
    ),
  ]
}

export const pathCoverage = ({ machine, paths }: MachinePaths): PathCoverageError | undefined => {
  const uncovered = uncoveredStructures({ machine, paths })
  return uncovered.length === 0 ? undefined : PathCoverageError.make({ machine: machine.id, uncovered })
}

export const assertPathCoverage = (input: MachinePaths): void => {
  const failure = pathCoverage(input)
  if (failure !== undefined) throw failure
}

const pairOfArrays = (pair: {
  readonly left: Raw
  readonly right: Raw
}): pair is { readonly left: ReadonlyArray<Raw>; readonly right: ReadonlyArray<Raw> } =>
  Array.isArray(pair.left) && Array.isArray(pair.right)

const pairOfRecords = (pair: {
  readonly left: Raw
  readonly right: Raw
}): pair is { readonly left: RawObject; readonly right: RawObject } => isRawObject(pair.left) && isRawObject(pair.right)

const sameArrays = (left: ReadonlyArray<Raw>, right: ReadonlyArray<Raw>): boolean =>
  left.length === right.length && Arr.every(left, (item, index) => deepEqual(item, right[index]))

const sameRecords = (left: RawObject, right: RawObject): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Arr.every(Object.keys(left), (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))

const deepEqual = (left: Raw, right: Raw): boolean =>
  Match.value({ left, right }).pipe(
    Match.when(({ left, right }) => Object.is(left, right), () => true),
    Match.when(pairOfArrays, ({ left, right }) => sameArrays(left, right)),
    Match.when(pairOfRecords, ({ left, right }) => sameRecords(left, right)),
    Match.orElse(() => false),
  )

const restoreActor = (machine: AnyStateMachine, snapshot: ModelSnapshot | undefined) =>
  snapshot === undefined ? createActor(machine) : createActor(machine, { snapshot })

export const runPath = ({ machine, path, store }: PathRunInput): PathRun => {
  const actor = createActor(machine).start()
  store.save(actor.getPersistedSnapshot())
  Arr.forEach(path.steps, (step) => {
    if (step.event.type !== INIT_EVENT) {
      actor.send(step.event)
      store.save(actor.getPersistedSnapshot())
    }
  })
  const persisted = actor.getPersistedSnapshot()
  const restored = restoreActor(machine, store.load()).start().getPersistedSnapshot()
  return { path, state: snapshotState(persisted), persisted, restored, roundTripped: deepEqual(persisted, restored) }
}

export const runPaths = ({ machine, store }: MachineStore): ReadonlyArray<PathRun> =>
  Arr.map(shortestPaths(machine), (path) => runPath({ machine, path, store }))

export const roundTripFailures = (runs: ReadonlyArray<PathRun>): ReadonlyArray<PathRun> =>
  Arr.filter(runs, (run) => run.roundTripped === false)

export const assertSnapshotRoundTrip = ({ machine, runs }: MachineRuns): void => {
  const failures = roundTripFailures(runs)
  if (failures.length > 0) {
    throw SnapshotRoundTripError.make({ machine: machine.id, states: Arr.map(failures, (run) => run.state) })
  }
}

export const runModelTest = ({ machine, store }: MachineStore): ModelTestReport => {
  const paths = shortestPaths(machine)
  return {
    runs: Arr.map(paths, (path) => runPath({ machine, path, store })),
    uncovered: uncoveredStructures({ machine, paths }),
  }
}
