import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Equal, Exit, Fiber, Hash, Layer, Predicate, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Arbitrary } from 'effect/unstable/arbitrary'

import { type Operation, type Recording, recording as makeRecording } from './history.js'
import { ModelError } from './model-errors.schema.js'
import { type Fail, noSequentialOrder, type Report } from './report.js'

/** A pure model of the implementation: the state a Schema declares, and one step. */
export interface Model<C, S, R> {
  readonly state: Schema.Codec<S>
  readonly initial: S
  readonly step: (state: S, command: C) => readonly [S, R]
}

/** What a check needs to judge an implementation through its public operations (R6). */
export interface Specification<C, S, R, E, REnv> {
  /** Commands are generated from this Schema; the check never takes hand-picked ones (R11). */
  readonly commands: Schema.Codec<C>
  readonly model: Model<C, S, R>
  /** One public operation of the implementation, run inside the implementation's context. */
  readonly run: (command: C) => Effect.Effect<R, E, REnv>
  readonly fibers: number
  readonly operations: number
  /** The command-generation seed; the same seed generates the same commands. */
  readonly seed?: number
  readonly preemptions?: number
  readonly maxSchedules?: number
}

export { ModelError }

const structuralTwin = <S extends object>(initial: S): S => ({ ...initial })

const isObject = <S>(initial: S): initial is S & object => typeof initial === 'object' && initial !== null

const hashEquivalent = <S>(initial: S & object): boolean =>
  Hash.isHash(initial) ? true : Equal.equals(initial, structuralTwin(initial))

const isStructural = <S>(initial: S): boolean => isObject(initial) ? hashEquivalent(initial) : true

const declaredState = <S>(state: Schema.Codec<S>, initial: S): Effect.Effect<void, ModelError> =>
  Effect.mapError(
    Schema.decodeUnknownEffect(state)(initial),
    () => modelError('state-schema-mismatch', 'the model initial state does not satisfy the declared state Schema'),
  ).pipe(Effect.asVoid)

const modelError = (problem: 'state-schema-mismatch' | 'state-not-structural', detail: string): ModelError =>
  new ModelError({ problem, detail })

/** Rejects a model at definition, before any run (R6: the state must be a structural Schema value). */
const validated = <C, S, R>(model: Model<C, S, R>): Effect.Effect<void, ModelError> =>
  declaredState(model.state, model.initial).pipe(
    Effect.filterOrFail(
      () => isStructural(model.initial),
      () =>
        modelError(
          'state-not-structural',
          'the model state must compare by structure with Effect Equal and Hash; a state compared by reference cannot be memoised',
        ),
    ),
  )

const generatedCommands = <C>(
  commands: Schema.Codec<C>,
  fibers: number,
  operations: number,
  seed: number,
): Effect.Effect<ReadonlyArray<ReadonlyArray<C>>> => {
  const sequence = Arbitrary.array(Arbitrary.schema(commands), { minLength: operations, maxLength: operations })
  return Effect.orDie(Arbitrary.sampleEffect(sequence, { count: fibers, seed }))
}

const issuedCommands = <C, R, E, REnv>(
  recording: Recording<C, R>,
  run: (command: C) => Effect.Effect<R, E, REnv>,
  worker: number,
  commands: ReadonlyArray<C>,
): Effect.Effect<void, E, REnv> =>
  Effect.forEach(commands, (command) => recording.record(worker, command, run(command)), { concurrency: 1 }).pipe(
    Effect.asVoid,
  )

const harness = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
): Effect.Effect<ReadonlyArray<Operation<C, R>>, E, REnv> =>
  Effect.gen(function*() {
    const recording = yield* makeRecording<C, R>()
    const workers = yield* Effect.forEach(
      assignments,
      (commands, worker) => Effect.forkChild(issuedCommands(recording, specification.run, worker, commands)),
    )
    yield* Effect.forEach(workers, (worker) => Fiber.join(worker), { concurrency: 1 })
    return yield* recording.operations
  })

const provided = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
): Effect.Effect<ReadonlyArray<Operation<C, R>>, E> =>
  Effect.provide(harness(specification, assignments), implementation)

const exitHistoryOf = <A, X>(exit: Exit.Exit<A, X>): A | undefined => Exit.isSuccess(exit) ? exit.value : undefined

const historyOf = <C, R, X>(
  result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>,
): ReadonlyArray<Operation<C, R>> | undefined => {
  if ('exit' in result) return exitHistoryOf(result.exit)
  return undefined
}

const failsWhen = <C, S, R, X>(
  model: Model<C, S, R>,
): (result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>) => boolean => {
  const judge = (result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>): boolean => {
    const history = historyOf(result)
    return history === undefined || order(model, history) === undefined
  }
  return judge
}

const firstDefined = <V, Kept>(value: V | undefined, keep: (defined: V) => Kept): Kept | Record<string, never> =>
  value === undefined ? {} : keep(value)

const searchOptionsOf = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
): Kernel.SearchOptions<ReadonlyArray<Operation<C, R>>, E> => ({
  ...firstDefined(specification.preemptions, (preemptions) => ({ preemptions })),
  ...firstDefined(specification.maxSchedules, (maxSchedules) => ({ maxSchedules })),
  isFailure: failsWhen(specification.model),
})

const searchedOutcome = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
): Effect.Effect<Kernel.SearchReport<ReadonlyArray<Operation<C, R>>, E>> =>
  Effect.promise(() =>
    Kernel.search(provided(specification, implementation, assignments), searchOptionsOf(specification))
  )

const deviationsOf = <C, R, X>(result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>): number =>
  result.steps.filter((step) => step.deviation).length

const failureOf = <C, R, X>(
  result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>,
): Kernel.RunFailure | undefined => {
  if ('failure' in result) return result.failure
  return undefined
}

const failureReportOf = <C, R, X>(
  result: Kernel.RunResult<ReadonlyArray<Operation<C, R>>, X>,
  schedule: ReadonlyArray<Kernel.Decision>,
  bound: Kernel.Bound,
): Report<C, R> => {
  const history = historyOf(result)
  if (history === undefined) {
    return { _tag: 'Incomplete', incomplete: { failure: failureOf(result), schedule, bound } }
  }
  const failure: Fail<C, R> = {
    _tag: 'Fail',
    failure: {
      judgement: noSequentialOrder,
      schedule: result.decisions,
      deviations: deviationsOf(result),
      operations: history,
      bound,
    },
  }
  return failure
}

interface Draw<C> {
  readonly worker: number
  readonly command: C
}

const flattened = <C>(assignments: ReadonlyArray<ReadonlyArray<C>>): ReadonlyArray<Draw<C>> =>
  assignments.flatMap((commands, worker) => commands.map((command) => ({ worker, command })))

const appendedDraw = <C>(byWorker: Map<number, Array<C>>, draw: Draw<C>): Map<number, Array<C>> => {
  const mine = byWorker.get(draw.worker)
  const commands = mine === undefined ? [] : mine
  commands.push(draw.command)
  byWorker.set(draw.worker, commands)
  return byWorker
}

const sequenceAt = <C>(byWorker: Map<number, Array<C>>): (worker: number) => ReadonlyArray<C> => (worker) => {
  const mine = byWorker.get(worker)
  return mine === undefined ? [] : mine
}

const unflattened = <C>(draws: ReadonlyArray<Draw<C>>): ReadonlyArray<ReadonlyArray<C>> => {
  const byWorker = draws.reduce((reduced, draw) => appendedDraw(reduced, draw), new Map<number, Array<C>>())
  const ascending = (left: number, right: number): number => left - right
  return [...byWorker.keys()].sort(ascending).map(sequenceAt(byWorker))
}

const minimizedOf = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  failure: Kernel.SearchFailure<ReadonlyArray<Operation<C, R>>, E>,
): Effect.Effect<Kernel.ShrinkOutcome<ReadonlyArray<Operation<C, R>>, E>> =>
  Effect.promise(() =>
    Kernel.shrink(provided(specification, implementation, assignments), {
      path: failure.path,
      isFailure: failsWhen(specification.model),
    })
  )

const stillFailsWith = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
): (candidate: ReadonlyArray<Draw<C>>) => Promise<boolean> =>
(candidate) =>
  Kernel.search(provided(specification, implementation, unflattened(candidate)), searchOptionsOf(specification)).then(
    (searched) => searched.failures.length > 0,
  )

const shrunkCommands = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
): Effect.Effect<ReadonlyArray<Draw<C>>> =>
  Effect.promise(() => Kernel.shrinkCommands(flattened(assignments), stillFailsWith(specification, implementation)))

const minimizedReport = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  failure: Kernel.SearchFailure<ReadonlyArray<Operation<C, R>>, E>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> =>
  Effect.map(
    minimizedOf(specification, implementation, assignments, failure),
    (shrunk) => failureReportOf(shrunk.result, shrunk.path, bound),
  )

const reducedFailures = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  failures: ReadonlyArray<Kernel.SearchFailure<ReadonlyArray<Operation<C, R>>, E>>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> => {
  const first = failures[0]
  return first === undefined
    ? Effect.succeed(passing(bound))
    : minimizedReport(specification, implementation, assignments, first, bound)
}

const reducedSearchReport = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  searched: Kernel.SearchReport<ReadonlyArray<Operation<C, R>>, E>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> => {
  const overBudget = overBudgetOf(searched)
  if (overBudget !== undefined) {
    return Effect.succeed({ _tag: 'OverBudget', bound: overBudget.bound })
  }
  return reducedFailures(specification, implementation, assignments, searched.failures, bound)
}

const shrunkReport = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
): Effect.Effect<Report<C, R>> =>
  Effect.flatMap(
    shrunkCommands(specification, implementation, assignments),
    (reduced) =>
      Effect.flatMap(searchedOutcome(specification, implementation, unflattened(reduced)), (searched) =>
        reducedSearchReport(specification, implementation, unflattened(reduced), searched, searched.bound)),
  )

const passing = (bound: Kernel.Bound): Report<never, never> => ({
  _tag: 'Pass',
  bound,
  histories: bound.runs,
})

const overBudgetOf = <A, E>(
  searched: Kernel.SearchReport<A, E>,
): Kernel.OverBudgetOutcome<A, E> | undefined => (Predicate.isTagged(searched, 'OverBudget') ? searched : undefined)

const reportedFailures = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  failures: ReadonlyArray<Kernel.SearchFailure<ReadonlyArray<Operation<C, R>>, E>>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> => {
  const first = failures[0]
  return first === undefined
    ? Effect.succeed(passing(bound))
    : shrunkReport(specification, implementation, assignments)
}

const reportedOutcome = <C, S, R, E, REnv>(
  specification: Specification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  assignments: ReadonlyArray<ReadonlyArray<C>>,
  searched: Kernel.SearchReport<ReadonlyArray<Operation<C, R>>, E>,
): Effect.Effect<Report<C, R>> => {
  const overBudget = overBudgetOf(searched)
  if (overBudget !== undefined) {
    return Effect.succeed({ _tag: 'OverBudget', bound: overBudget.bound })
  }
  return reportedFailures(specification, implementation, assignments, searched.failures, searched.bound)
}

const checkImpl = <C, S, R, E, REnv>(
  implementation: Layer.Layer<REnv, E>,
  specification: Specification<C, S, R, E, REnv>,
): Effect.Effect<Report<C, R>, ModelError> =>
  Effect.flatMap(validated(specification.model), () =>
    Effect.flatMap(
      generatedCommands(
        specification.commands,
        specification.fibers,
        specification.operations,
        specification.seed ?? 0,
      ),
      (assignments) =>
        Effect.flatMap(
          searchedOutcome(specification, implementation, assignments),
          (searched) => reportedOutcome(specification, implementation, assignments, searched),
        ),
    ))

export const linearizable: {
  <C, S, R, E, REnv>(
    implementation: Layer.Layer<REnv, E>,
    specification: Specification<C, S, R, E, REnv>,
  ): Effect.Effect<Report<C, R>, ModelError>
  <C, S, R, E, REnv>(
    specification: Specification<C, S, R, E, REnv>,
  ): (implementation: Layer.Layer<REnv, E>) => Effect.Effect<Report<C, R>, ModelError>
} = dual(2, checkImpl)

const finishedBefore = <C, R>(before: Operation<C, R>, after: Operation<C, R>): boolean => {
  const finished = before.answered
  return finished !== undefined && after.invoked > finished
}

const sameWorkerEarlier = <C, R>(before: Operation<C, R>, after: Operation<C, R>): boolean =>
  before.worker === after.worker && before.invoked < after.invoked

const precedes = <C, R>(before: Operation<C, R>, after: Operation<C, R>): boolean =>
  finishedBefore(before, after) || sameWorkerEarlier(before, after)

const predecessorsOf = <C, R>(
  operations: ReadonlyArray<Operation<C, R>>,
  after: Operation<C, R>,
): ReadonlyArray<number> => operations.flatMap((before, at) => (precedes(before, after) ? [at] : []))

const isAnswered = <C, R>(operation: Operation<C, R>): boolean => operation.answered !== undefined

interface Candidate<C, R> {
  readonly index: number
  readonly operation: Operation<C, R>
  readonly predecessors: ReadonlyArray<number>
}

const candidatesOf = <C, R>(operations: ReadonlyArray<Operation<C, R>>): ReadonlyArray<Candidate<C, R>> =>
  operations.flatMap((operation, index) =>
    isAnswered(operation)
      ? [{ index, operation, predecessors: predecessorsOf(operations, operation) }]
      : []
  )

const availableNow = <C, R>(candidate: Candidate<C, R>, done: ReadonlyArray<number>): boolean =>
  done.includes(candidate.index) ? false : candidate.predecessors.every((predecessor) => done.includes(predecessor))

type Memo<S> = Map<number, ReadonlyArray<readonly [ReadonlyArray<number>, S]>>

const memoKey = <S>(done: ReadonlyArray<number>, state: S): number => Hash.combine(Hash.hash(state))(Hash.hash(done))

const entryMatches = <S>(
  entry: readonly [ReadonlyArray<number>, S],
  done: ReadonlyArray<number>,
  state: S,
): boolean => Equal.equals(entry[0], done) && Equal.equals(entry[1], state)

const seenBefore = <S>(memo: Memo<S>, done: ReadonlyArray<number>, state: S): boolean => {
  const entries = memo.get(memoKey(done, state))
  const known = entries === undefined ? [] : entries
  return known.some((entry) => entryMatches(entry, done, state))
}

const remembered = <S>(memo: Memo<S>, done: ReadonlyArray<number>, state: S): void => {
  const key = memoKey(done, state)
  const entries = memo.get(key)
  const known = entries === undefined ? [] : entries
  memo.set(key, [...known, [done, state]])
}

const agreed = <C, R, X>(operation: Operation<C, R>, response: X): boolean =>
  isAnswered(operation) ? Equal.equals(response, operation.response) : true

const attemptedOrNext = <C, R>(
  candidate: Candidate<C, R>,
  available: ReadonlyArray<Candidate<C, R>>,
  position: number,
  attempt: (candidate: Candidate<C, R>) => ReadonlyArray<number> | undefined,
): ReadonlyArray<number> | undefined => {
  const found = attempt(candidate)
  return found !== undefined ? found : attemptAt(available, position + 1, attempt)
}

const attemptAt = <C, R>(
  available: ReadonlyArray<Candidate<C, R>>,
  position: number,
  attempt: (candidate: Candidate<C, R>) => ReadonlyArray<number> | undefined,
): ReadonlyArray<number> | undefined => {
  const candidate = available[position]
  if (candidate === undefined) return undefined
  return attemptedOrNext(candidate, available, position, attempt)
}

const stepped = <C, S, R>(
  model: Model<C, S, R>,
  candidates: ReadonlyArray<Candidate<C, R>>,
  memo: Memo<S>,
  done: ReadonlyArray<number>,
  state: S,
  candidate: Candidate<C, R>,
): ReadonlyArray<number> | undefined => {
  const [next, response] = model.step(state, candidate.operation.command)
  return agreed(candidate.operation, response)
    ? walk(model, candidates, [...done, candidate.index], next, memo)
    : undefined
}

const settled = <C, S, R>(
  model: Model<C, S, R>,
  candidates: ReadonlyArray<Candidate<C, R>>,
  memo: Memo<S>,
  done: ReadonlyArray<number>,
  state: S,
): ReadonlyArray<number> | undefined => {
  const picks = (candidate: Candidate<C, R>): ReadonlyArray<number> | undefined =>
    stepped(model, candidates, memo, done, state, candidate)
  const found = attemptAt(candidates.filter((candidate) => availableNow(candidate, done)), 0, picks)
  if (found !== undefined) return found
  remembered(memo, done, state)
  return undefined
}

const revisited = <C, S, R>(
  model: Model<C, S, R>,
  candidates: ReadonlyArray<Candidate<C, R>>,
  memo: Memo<S>,
  done: ReadonlyArray<number>,
  state: S,
): ReadonlyArray<number> | undefined => {
  if (seenBefore(memo, done, state)) return undefined
  return settled(model, candidates, memo, done, state)
}

const walk = <C, S, R>(
  model: Model<C, S, R>,
  candidates: ReadonlyArray<Candidate<C, R>>,
  done: ReadonlyArray<number>,
  state: S,
  memo: Memo<S>,
): ReadonlyArray<number> | undefined => {
  if (done.length === candidates.length) return done
  return revisited(model, candidates, memo, done, state)
}

/**
 * The sequential order that explains a history, as the indices of the completed
 * operations in model order, or undefined when no order explains it (KTD5).
 * Operations whose worker never answered are dropped, which linearizability
 * allows because an operation without a response precedes nothing.
 */
export const order: {
  <C, S, R>(model: Model<C, S, R>, history: ReadonlyArray<Operation<C, R>>): ReadonlyArray<number> | undefined
  <C, S, R>(
    history: ReadonlyArray<Operation<C, R>>,
  ): (model: Model<C, S, R>) => ReadonlyArray<number> | undefined
} = dual(
  2,
  <C, S, R>(model: Model<C, S, R>, history: ReadonlyArray<Operation<C, R>>): ReadonlyArray<number> | undefined =>
    walk(model, candidatesOf(history), [], model.initial, new Map()),
)
