import { Cause, type Context, Effect, Exit, type FileSystem, Option, Schema } from 'effect'
import * as fc from 'fast-check'
import * as Contract from './Contract.js'
import type { ContractDecodeError } from './ContractDecodeError.schema.js'
import type { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { Observation } from './Observation.service.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import * as TaskAnnounce from './TaskAnnounce.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'
import { Hold } from './Verdict.schema.js'

type PropFailure = ContractDecodeError | EmptyObservationError | TraceDisparityError | StimulusFailure

/** Parity with differential-spec's supervisor default run budget. */
const RUN_BUDGET = 100

const isDisparity = Schema.is(TraceDisparityError)

const isHold = Schema.is(Hold)

const disparityOf = <E>(cause: Cause.Cause<E>): Option.Option<TraceDisparityError> =>
  Option.filter(Cause.findErrorOption(cause), isDisparity)

const drawHolds = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  context: Context.Context<R | Observation | FileSystem.FileSystem>,
): (input: Input) => Promise<boolean> =>
(input) =>
  Effect.runPromiseExitWith(context)(Contract.trace(contract, input)).then((exit) =>
    Exit.match(exit, {
      onSuccess: (traced) => isHold(traced.verdict),
      onFailure: () => false,
    })
  )

const attempt = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  arbitrary: fc.Arbitrary<Input>,
  context: Context.Context<R | Observation | FileSystem.FileSystem>,
): Promise<fc.RunDetails<[Input]>> =>
  fc.check(fc.asyncProperty(arbitrary, drawHolds(contract, context)), { numRuns: RUN_BUDGET })

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
      detail: `the shrunk input ${JSON.stringify(input)} did not reproduce a relation break`,
    }),
  )

const reproducedFailure = <Input>(
  stimulus: string,
  input: Input,
  disparity: TraceDisparityError,
): Effect.Effect<never, PropFailure, FileSystem.FileSystem> =>
  Effect.gen(function*() {
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
      onFailure: (cause) =>
        Option.match(disparityOf(cause), {
          onNone: () => unreproduced(contract.stimulus.name, input),
          onSome: (disparity) => reproducedFailure(contract.stimulus.name, input, disparity),
        }),
    })
  })

const conclude = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  details: fc.RunDetails<[Input]>,
): Effect.Effect<void, PropFailure, R | Observation | FileSystem.FileSystem> => {
  const input = counterexampleInput(details)
  return input === undefined ? notFound(contract.stimulus.name, details) : shrunkFailure(contract, input)
}

export const body = <Input, Output, E, R>(
  contract: Contract.Contract<Input, Output, E, R>,
  arbitrary: fc.Arbitrary<Input>,
): Effect.Effect<void, PropFailure, R | Observation | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<R | Observation | FileSystem.FileSystem>()
    const details = yield* Effect.promise(() => attempt(contract, arbitrary, context))
    return yield* conclude(contract, details)
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
        return Option.contains(disparityOf(Cause.fail(error)), error)
      }),
  )

  it.prop(
    '∀d_DisparityOf_=NoneForForeignFailures',
    [Schema.String],
    ([detail]) =>
      Effect.sync(() => Option.isNone(disparityOf(Cause.fail(new StimulusFailure({ stimulus: 's', detail }))))),
  )
}
