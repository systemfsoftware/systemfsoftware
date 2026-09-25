import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Equal, Exit, Layer, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Arbitrary } from 'effect/unstable/arbitrary'

import { type Operation, type Recording, recording as makeRecording } from './history.js'
import type { Model } from './linearizable.js'
import { ModelError } from './model-errors.schema.js'
import { modelDivergedAt, type Report } from './report.js'

/**
 * A model that declares, per command, when it may run over the model state
 * (R7). A command refused by the precondition is skipped at run time, never
 * filtered out of the generation (KTD6), so shrinking can delete commands
 * without re-deriving preconditions.
 */
export interface SequentialModel<C, S, R> extends Model<C, S, R> {
  readonly precondition: (state: S, command: C) => boolean
}

/** What the sequential model check needs to drive one implementation through generated sequences (R7). */
export interface SequentialSpecification<C, S, R, E, REnv> {
  /** Commands are generated from this Schema; the check never takes hand-picked ones (R11). */
  readonly commands: Schema.Codec<C>
  readonly model: SequentialModel<C, S, R>
  /** One public operation of the implementation, run inside the implementation's context. */
  readonly run: (command: C) => Effect.Effect<R, E, REnv>
  /** How many sequences are drawn from the command Schema's arbitrary. */
  readonly sequences: number
  /** How many commands each drawn sequence carries before the model state skips the rest. */
  readonly operations: number
  /** The command-generation seed; the same seed draws the same sequences. */
  readonly seed?: number
}

/** One sequence walked so far: the model state, the commands run, and the first step that diverged. */
interface Walk<S> {
  readonly state: S
  readonly ran: number
  readonly divergence: number | undefined
}

const startWalk = <S>(initial: S): Walk<S> => ({ state: initial, ran: 0, divergence: undefined })

const drawnSequences = <C>(
  commands: Schema.Codec<C>,
  sequences: number,
  operations: number,
  seed: number,
): Effect.Effect<ReadonlyArray<ReadonlyArray<C>>> => {
  const sequence = Arbitrary.array(Arbitrary.schema(commands), { minLength: operations, maxLength: operations })
  return Effect.orDie(Arbitrary.sampleEffect(sequence, { count: sequences, seed }))
}

const stateFits = <S>(state: Schema.Codec<S>, initial: S): Effect.Effect<void, ModelError> =>
  Effect.mapError(
    Schema.decodeUnknownEffect(state)(initial),
    () =>
      new ModelError({
        problem: 'state-schema-mismatch',
        detail: 'the model initial state does not satisfy the declared state Schema',
      }),
  ).pipe(Effect.asVoid)

const advanced = <S, R>(walk: Walk<S>, next: S, expected: R, observed: R): Walk<S> => {
  const ran = walk.ran + 1
  return Equal.equals(observed, expected)
    ? { state: next, ran, divergence: undefined }
    : { state: next, ran, divergence: ran }
}

const comparedOnce = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  recording: Recording<C, R>,
  walk: Walk<S>,
  command: C,
): Effect.Effect<Walk<S>, E, REnv> => {
  const [next, expected] = specification.model.step(walk.state, command)
  return Effect.map(
    recording.record(0, command, specification.run(command)),
    (observed) => advanced(walk, next, expected, observed),
  )
}

const attempted = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  recording: Recording<C, R>,
  walk: Walk<S>,
  command: C,
): Effect.Effect<Walk<S>, E, REnv> =>
  specification.model.precondition(walk.state, command)
    ? comparedOnce(specification, recording, walk, command)
    : Effect.succeed(walk)

const stepped = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  recording: Recording<C, R>,
  walk: Walk<S>,
  command: C,
): Effect.Effect<Walk<S>, E, REnv> =>
  walk.divergence === undefined
    ? attempted(specification, recording, walk, command)
    : Effect.succeed(walk)

/** What one generated sequence produced: every recorded operation, and the first step the model did not explain. */
interface SequenceOutcome<C, R> {
  readonly operations: ReadonlyArray<Operation<C, R>>
  readonly divergence: number | undefined
}

const walkedSequence = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  commands: ReadonlyArray<C>,
): Effect.Effect<SequenceOutcome<C, R>, E, REnv> =>
  Effect.gen(function*() {
    const recording = yield* makeRecording<C, R>()
    const walked = yield* Effect.reduce(
      commands,
      () => startWalk(specification.model.initial),
      (walk, command) => stepped(specification, recording, walk, command),
    )
    return { operations: yield* recording.operations, divergence: walked.divergence }
  })

const provided = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  commands: ReadonlyArray<C>,
): Effect.Effect<SequenceOutcome<C, R>, E> => Effect.provide(walkedSequence(specification, commands), implementation)

/** One generated sequence run on one fiber under the kernel's zero-preemption schedule (R7, KTD3). */
interface Attempt<C, R, E> {
  readonly commands: ReadonlyArray<C>
  readonly result: Kernel.RunResult<SequenceOutcome<C, R>, E>
}

const ranOnce = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  commands: ReadonlyArray<C>,
): Effect.Effect<Attempt<C, R, E>> =>
  Effect.map(
    Effect.promise(() => Kernel.run(provided(specification, implementation, commands))),
    (result) => ({ commands, result }),
  )

const outcomeExitOf = <C, R, X>(exit: Exit.Exit<SequenceOutcome<C, R>, X>): SequenceOutcome<C, R> | undefined =>
  Exit.isSuccess(exit) ? exit.value : undefined

const recordedIn = <C, R, X>(
  result: Kernel.RunResult<SequenceOutcome<C, R>, X>,
): SequenceOutcome<C, R> | undefined => {
  if ('exit' in result) return outcomeExitOf(result.exit)
  return undefined
}

const diverged = <C, R, X>(result: Kernel.RunResult<SequenceOutcome<C, R>, X>): boolean => {
  const outcome = recordedIn(result)
  return outcome !== undefined && outcome.divergence !== undefined
}

const boundOf = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  runs: number,
): Kernel.Bound => ({
  fibers: 1,
  operations: specification.operations,
  preemptions: 0,
  depth: 0,
  runs,
  pruning: Kernel.pruned,
})

const deviationsIn = <C, R, X>(result: Kernel.RunResult<SequenceOutcome<C, R>, X>): number =>
  result.steps.filter((step) => step.deviation).length

const incompleteReport = <C, R, X>(
  result: Kernel.RunResult<SequenceOutcome<C, R>, X>,
  bound: Kernel.Bound,
): Report<C, R> => ({
  _tag: 'Incomplete',
  incomplete: {
    failure: 'failure' in result ? result.failure : undefined,
    schedule: result.decisions,
    bound,
  },
})

const divergedFailure = <C, R, X>(
  divergence: number,
  outcome: SequenceOutcome<C, R>,
  result: Kernel.RunResult<SequenceOutcome<C, R>, X>,
  bound: Kernel.Bound,
): Report<C, R> => ({
  _tag: 'Fail',
  failure: {
    judgement: modelDivergedAt(divergence),
    schedule: result.decisions,
    deviations: deviationsIn(result),
    operations: outcome.operations,
    bound,
  },
})

const divergedReport = <C, R, X>(
  result: Kernel.RunResult<SequenceOutcome<C, R>, X>,
  bound: Kernel.Bound,
): Report<C, R> => {
  const outcome = recordedIn(result)
  return outcome === undefined ? incompleteReport(result, bound) : succeededReport(outcome, result, bound)
}

const succeededReport = <C, R, X>(
  outcome: SequenceOutcome<C, R>,
  result: Kernel.RunResult<SequenceOutcome<C, R>, X>,
  bound: Kernel.Bound,
): Report<C, R> => {
  const divergence = outcome.divergence
  if (divergence === undefined) return incompleteReport(result, bound)
  return divergedFailure(divergence, outcome, result, bound)
}

const stillDiverges = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
): (candidate: ReadonlyArray<C>) => Promise<boolean> =>
(candidate) => Kernel.run(provided(specification, implementation, candidate)).then(diverged)

/** Shrinks the command sequence with the schedule fixed on the zero-preemption schedule (KTD7). */
const shrunkAttempt = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  attempt: Attempt<C, R, E>,
): Promise<Attempt<C, R, E>> =>
  Kernel.shrinkCommands(attempt.commands, stillDiverges(specification, implementation)).then((reduced) =>
    Kernel.run(provided(specification, implementation, reduced)).then((result) => ({ commands: reduced, result }))
  )

const shrunkReport = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  attempt: Attempt<C, R, E>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> =>
  Effect.map(
    Effect.promise(() => shrunkAttempt(specification, implementation, attempt)),
    (shrunk) => divergedReport(shrunk.result, bound),
  )

const divergentAttempt = <C, R, E>(attempts: ReadonlyArray<Attempt<C, R, E>>): Attempt<C, R, E> | undefined =>
  attempts.find((attempt) => diverged(attempt.result))

const unfinishedAttempt = <C, R, E>(attempts: ReadonlyArray<Attempt<C, R, E>>): Attempt<C, R, E> | undefined =>
  attempts.find((attempt) => recordedIn(attempt.result) === undefined)

const passingReport = (bound: Kernel.Bound): Report<never, never> => ({
  _tag: 'Pass',
  bound,
  histories: bound.runs,
})

const reportedUnfinished = <C, R, E>(
  attempts: ReadonlyArray<Attempt<C, R, E>>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> => {
  const unfinished = unfinishedAttempt(attempts)
  return unfinished === undefined
    ? Effect.succeed(passingReport(bound))
    : Effect.succeed(incompleteReport(unfinished.result, bound))
}

const reportedAttempt = <C, S, R, E, REnv>(
  specification: SequentialSpecification<C, S, R, E, REnv>,
  implementation: Layer.Layer<REnv, E>,
  attempts: ReadonlyArray<Attempt<C, R, E>>,
  bound: Kernel.Bound,
): Effect.Effect<Report<C, R>> => {
  const divergent = divergentAttempt(attempts)
  return divergent === undefined
    ? reportedUnfinished(attempts, bound)
    : shrunkReport(specification, implementation, divergent, bound)
}

const checkImpl = <C, S, R, E, REnv>(
  implementation: Layer.Layer<REnv, E>,
  specification: SequentialSpecification<C, S, R, E, REnv>,
): Effect.Effect<Report<C, R>, ModelError> =>
  Effect.flatMap(stateFits(specification.model.state, specification.model.initial), () =>
    Effect.flatMap(
      drawnSequences(
        specification.commands,
        specification.sequences,
        specification.operations,
        specification.seed ?? 0,
      ),
      (sequences) =>
        Effect.flatMap(
          Effect.forEach(sequences, (commands) => ranOnce(specification, implementation, commands), {
            concurrency: 1,
          }),
          (attempts) =>
            reportedAttempt(
              specification,
              implementation,
              attempts,
              boundOf(specification, attempts.length),
            ),
        ),
    ))

/**
 * The sequential model check (R7): draws command sequences from the command
 * Schema's arbitrary, runs each on one fiber under the kernel's
 * zero-preemption schedule, skips commands the model's precondition refuses,
 * and compares every response with the model. A divergence shrinks to the
 * shortest sequence that still diverges and names the step where the model
 * stopped explaining the responses (R10, KTD6, KTD7).
 */
export const sequential: {
  <C, S, R, E, REnv>(
    implementation: Layer.Layer<REnv, E>,
    specification: SequentialSpecification<C, S, R, E, REnv>,
  ): Effect.Effect<Report<C, R>, ModelError>
  <C, S, R, E, REnv>(
    specification: SequentialSpecification<C, S, R, E, REnv>,
  ): (implementation: Layer.Layer<REnv, E>) => Effect.Effect<Report<C, R>, ModelError>
} = dual(2, checkImpl)
