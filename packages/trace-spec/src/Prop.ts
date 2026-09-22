import { Cause, type Context, Effect, Exit, type FileSystem, Option, Schema } from 'effect'
import * as fc from 'fast-check'
import * as Contract from './Contract.js'
import type { ContractDecodeError } from './ContractDecodeError.schema.js'
import type { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { Observation } from './Observe.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import * as TaskAnnounce from './TaskAnnounce.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'

type CheckFailure<E> = E | ContractDecodeError | EmptyObservationError | TraceDisparityError

type PropFailure = ContractDecodeError | EmptyObservationError | TraceDisparityError | StimulusFailure

/** Parity with differential-spec's supervisor default run budget. */
const RUN_BUDGET = 100

const isDisparity = Schema.is(TraceDisparityError)

const renderInput = <Input>(input: Input): string => JSON.stringify(input)

const disparityOf = <E>(cause: Cause.Cause<E>): TraceDisparityError | null => {
  const failure = Option.getOrNull(Cause.findErrorOption(cause))
  return isDisparity(failure) ? failure : null
}

interface Attempt<Input> {
  readonly details: fc.RunDetails<[Input]>
  readonly disparities: ReadonlyArray<TraceDisparityError>
}

const recordDisparity = <E>(cause: Cause.Cause<E>, disparities: Array<TraceDisparityError>): void => {
  const disparity = disparityOf(cause)
  if (disparity !== null) disparities.push(disparity)
}

const holdsGenerated = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  context: Context.Context<R | Observation | FileSystem.FileSystem>,
  disparities: Array<TraceDisparityError>,
): (input: Input) => Promise<boolean> =>
(input) => {
  const checked = Contract.check(contract, input).pipe(Effect.provide(context))
  return Effect.runPromiseExit(checked).then((exit) =>
    Exit.match(exit, {
      onSuccess: () => true,
      onFailure: (cause) => {
        recordDisparity(cause, disparities)
        return false
      },
    })
  )
}

const attempt = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  arbitrary: fc.Arbitrary<Input>,
  context: Context.Context<R | Observation | FileSystem.FileSystem>,
): Promise<Attempt<Input>> => {
  const disparities: Array<TraceDisparityError> = []
  const generated = holdsGenerated(contract, context, disparities)
  return fc.check(fc.asyncProperty(arbitrary, generated), { numRuns: RUN_BUDGET }).then((details) => ({
    details,
    disparities,
  }))
}

const counterexampleInput = <Input>(details: fc.RunDetails<[Input]>): Input | undefined =>
  details.counterexample === null ? undefined : details.counterexample[0]

const interruptedFailure = <Input>(stimulus: string, details: fc.RunDetails<[Input]>): StimulusFailure =>
  new StimulusFailure({
    stimulus,
    detail: `the generated property was interrupted after ${details.numRuns} runs without a counterexample`,
  })

const notFound = <Input>(
  stimulus: string,
  details: fc.RunDetails<[Input]>,
): Effect.Effect<void, StimulusFailure> =>
  details.interrupted ? Effect.fail(interruptedFailure(stimulus, details)) : Effect.void

const unreproduced = <Input>(
  stimulus: string,
  input: Input,
): Effect.Effect<never, StimulusFailure> =>
  Effect.fail(
    new StimulusFailure({
      stimulus,
      detail: `the shrunk input ${renderInput(input)} did not reproduce a relation break`,
    }),
  )

const disparityBreak = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  input: Input,
  cause: Cause.Cause<CheckFailure<E>>,
): Effect.Effect<never, PropFailure, R | Observation | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const disparity = disparityOf(cause)
    if (disparity === null) return yield* unreproduced(contract.stimulus.name, input)
    yield* TaskAnnounce.announceCounterexample(input)
    yield* TaskAnnounce.announceDump(disparity)
    return yield* disparity
  })

const shrunkFailure = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  input: Input,
): Effect.Effect<never, PropFailure, R | Observation | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const exit = yield* Effect.exit(Contract.check(contract, input))
    return yield* Exit.match(exit, {
      onSuccess: () => unreproduced(contract.stimulus.name, input),
      onFailure: (cause) => disparityBreak(contract, input, cause),
    })
  })

const conclude = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  run: Attempt<Input>,
): Effect.Effect<void, PropFailure, R | Observation | FileSystem.FileSystem> => {
  const input = counterexampleInput(run.details)
  return input === undefined ? notFound(contract.stimulus.name, run.details) : shrunkFailure(contract, input)
}

export const body = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  arbitrary: fc.Arbitrary<Input>,
): Effect.Effect<void, PropFailure, R | Observation | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<R | Observation | FileSystem.FileSystem>()
    const run = yield* Effect.promise(() => attempt(contract, arbitrary, context))
    return yield* conclude(contract, run)
  })

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀p_DisparityOf_=TheFailedDisparity',
    [Schema.NullOr(Schema.String)],
    ([dumpPath]) =>
      Effect.sync(() => {
        const error = new TraceDisparityError({ relationId: 'r', traceId: 't', breaks: [], dumpPath })
        return disparityOf(Cause.fail(error)) === error
      }),
  )

  it.prop(
    '∀d_DisparityOf_=NullForForeignFailures',
    [Schema.String],
    ([detail]) => Effect.sync(() => disparityOf(Cause.fail(new StimulusFailure({ stimulus: 's', detail }))) === null),
  )
}
