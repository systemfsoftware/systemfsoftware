import { recordAssertion } from '@effect/vitest'
import { Cause, Effect, Exit, Function } from 'effect'
import * as fc from 'fast-check'
import { DisparityError } from './DisparityError.schema.js'
import { formatDisparity, renderExit, renderUnknown } from './DisparityReporter.js'

export interface DualExecutionSupervisorOptions {
  readonly runBudget?: number
  readonly interruptAfterTimeLimit?: number
}

const runDualImpl = <InputA, InputB, OutputA, OutputB, E>(
  targetA: (input: InputA) => Effect.Effect<OutputA, E>,
  targetB: (input: InputB) => Effect.Effect<OutputB, E>,
  inputA: InputA,
  inputB: InputB,
): Effect.Effect<[Exit.Exit<OutputA, E>, Exit.Exit<OutputB, E>], never> =>
  Effect.all([Effect.exit(targetA(inputA)), Effect.exit(targetB(inputB))])

export const runDual: {
  <InputA, InputB, OutputA, OutputB, E>(
    targetB: (input: InputB) => Effect.Effect<OutputB, E>,
    inputA: InputA,
    inputB: InputB,
  ): (
    targetA: (input: InputA) => Effect.Effect<OutputA, E>,
  ) => Effect.Effect<[Exit.Exit<OutputA, E>, Exit.Exit<OutputB, E>], never>
  <InputA, InputB, OutputA, OutputB, E>(
    targetA: (input: InputA) => Effect.Effect<OutputA, E>,
    targetB: (input: InputB) => Effect.Effect<OutputB, E>,
    inputA: InputA,
    inputB: InputB,
  ): Effect.Effect<[Exit.Exit<OutputA, E>, Exit.Exit<OutputB, E>], never>
} = Function.dual(4, runDualImpl)

const DEFAULT_OPTIONS = {
  runBudget: 100,
  interruptAfterTimeLimit: 5000,
} as const

const toFcParameters = <Input>(
  options?: DualExecutionSupervisorOptions,
): fc.Parameters<[Input]> => {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  return { numRuns: merged.runBudget, interruptAfterTimeLimit: merged.interruptAfterTimeLimit }
}

const reproOf = (seed: number, path: string | undefined): string =>
  `fc.check(property, { seed: ${seed}, path: "${path ?? ''}" })`

const bothSucceeded = <A, B, E>(
  exits: readonly [Exit.Exit<A, E>, Exit.Exit<B, E>],
): exits is readonly [Exit.Success<A, E>, Exit.Success<B, E>] => Exit.isSuccess(exits[0]) && Exit.isSuccess(exits[1])

const bothFailed = <A, B, E>(
  exits: readonly [Exit.Exit<A, E>, Exit.Exit<B, E>],
): exits is readonly [Exit.Failure<A, E>, Exit.Failure<B, E>] => Exit.isFailure(exits[0]) && Exit.isFailure(exits[1])
type StringRecord<V = unknown> = Record<string, V>
type StringEntry<V = unknown> = [string, V]

const ownFields = (error: Error): StringRecord => {
  const entries: Array<StringEntry> = Object.entries(error)
  return Object.fromEntries(entries)
}

const errorIdentity = (error: Error): string => `${error.name}:${error.message}:${renderUnknown(ownFields(error))}`

const failureFingerprint = <E>(cause: Cause.Cause<E>): string => Cause.prettyErrors(cause).map(errorIdentity).join('\n')

const failuresMatch = <A, B, E>(exits: readonly [Exit.Exit<A, E>, Exit.Exit<B, E>]): boolean => {
  if (!bothFailed(exits)) return false
  return failureFingerprint(exits[0].cause) === failureFingerprint(exits[1].cause)
}

const dualHolds = <Input, OutputA, OutputB, E>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  inputA: Input,
  inputB: Input,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): Promise<boolean> =>
  Effect.runPromise(runDual(targetA, targetB, inputA, inputB)).then((exits) => {
    if (bothSucceeded(exits)) return oracle(exits[0].value, exits[1].value)
    return failuresMatch(exits)
  })

type FailedWithCounterexample<Input> = Extract<
  fc.RunDetails<[Input]>,
  { readonly failed: true; readonly counterexample: [Input] }
>

const isFailedWithCounterexample = <Input>(
  details: fc.RunDetails<[Input]>,
): details is FailedWithCounterexample<Input> => details.failed && details.counterexample !== null

const inconclusiveReport = <Input>(details: fc.RunDetails<[Input]>): DisparityError =>
  new DisparityError({
    report: formatDisparity({
      input: '(inconclusive run — no counterexample produced)',
      outputA: '(not executed)',
      outputB: '(not executed)',
      trace:
        `seed ${details.seed}, runs ${details.numRuns}, skipped ${details.numSkips}, interrupted ${details.interrupted}`,
      reproSnippet: 'raise runBudget / interruptAfterTimeLimit, or loosen the arbitrary so draws stop skipping',
    }),
  })

type FollowUp<Input, Err = unknown> = { readonly ok: true; readonly value: Input } | {
  readonly ok: false
  readonly error: Err
}

const followUpOf = <Input>(secondInput: (input: Input) => Input, input: Input): FollowUp<Input> => {
  try {
    return { ok: true, value: secondInput(input) }
  } catch (error) {
    return { ok: false, error }
  }
}

const transformThrewReport = <Input, E = unknown>(
  details: FailedWithCounterexample<Input>,
  input: Input,
  error: E,
): DisparityError =>
  new DisparityError({
    report: formatDisparity({
      input,
      outputA: '(input transform threw while re-running the minimal counterexample)',
      outputB: renderUnknown(error),
      trace: `seed ${details.seed}, path ${details.counterexamplePath}`,
      reproSnippet: reproOf(details.seed, details.counterexamplePath),
    }),
  })

const disparityOf = <Input, OutputA, OutputB, E, DescribedInput = unknown>(
  details: FailedWithCounterexample<Input>,
  input: DescribedInput,
  exitA: Exit.Exit<OutputA, E>,
  exitB: Exit.Exit<OutputB, E>,
): DisparityError =>
  new DisparityError({
    report: formatDisparity({
      input,
      outputA: renderExit(exitA),
      outputB: renderExit(exitB),
      trace: `seed ${details.seed}, path ${details.counterexamplePath}`,
      reproSnippet: reproOf(details.seed, details.counterexamplePath),
    }),
  })

const reportCounterexample = <Input, OutputA, OutputB, E, DescribedInput = unknown>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  secondInput: (input: Input) => Input,
  describeInput: (input: Input, followUp: Input) => DescribedInput,
  details: FailedWithCounterexample<Input>,
  input: Input,
): Effect.Effect<void, DisparityError> => {
  const followUp = followUpOf(secondInput, input)
  if (!followUp.ok) return Effect.fail(transformThrewReport(details, input, followUp.error))
  return Effect.flatMap(
    runDual(targetA, targetB, input, followUp.value),
    ([exitA, exitB]) => disparityOf(details, describeInput(input, followUp.value), exitA, exitB),
  )
}

const reportFailure = <Input, OutputA, OutputB, E, DescribedInput = unknown>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  secondInput: (input: Input) => Input,
  describeInput: (input: Input, followUp: Input) => DescribedInput,
  details: fc.RunDetails<[Input]>,
): Effect.Effect<void, DisparityError> => {
  if (!isFailedWithCounterexample(details)) return Effect.fail(inconclusiveReport(details))
  return reportCounterexample(targetA, targetB, secondInput, describeInput, details, details.counterexample[0])
}

const isConclusivePass = <Input>(details: fc.RunDetails<[Input]>): boolean => !details.failed && !details.interrupted

const failWithDisparity = <Input, OutputA, OutputB, E, DescribedInput = unknown>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  secondInput: (input: Input) => Input,
  describeInput: (input: Input, followUp: Input) => DescribedInput,
  details: fc.RunDetails<[Input]>,
): Effect.Effect<void, DisparityError> => {
  if (isConclusivePass(details)) return Effect.sync(recordAssertion)
  return reportFailure(targetA, targetB, secondInput, describeInput, details)
}

const checkWithShrink = <Input>(
  arb: fc.Arbitrary<Input>,
  predicate: (input: Input) => Promise<boolean>,
  options?: DualExecutionSupervisorOptions,
): Effect.Effect<fc.RunDetails<[Input]>> =>
  Effect.promise(() => fc.check(fc.asyncProperty(arb, predicate), toFcParameters<Input>(options)))

const runDifferentialWithShrinkImpl = <Input, OutputA, OutputB, E>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  arb: fc.Arbitrary<Input>,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
  options?: DualExecutionSupervisorOptions,
): Effect.Effect<void, DisparityError> =>
  Effect.flatMap(
    checkWithShrink(arb, (input: Input) => dualHolds(targetA, targetB, input, input, oracle), options),
    (details) => failWithDisparity(targetA, targetB, Function.identity, Function.identity, details),
  )

export const runDifferentialWithShrink: {
  <Input, OutputA, OutputB, E>(
    targetB: (input: Input) => Effect.Effect<OutputB, E>,
    arb: fc.Arbitrary<Input>,
    oracle: (outputA: OutputA, outputB: OutputB) => boolean,
    options?: DualExecutionSupervisorOptions,
  ): (targetA: (input: Input) => Effect.Effect<OutputA, E>) => Effect.Effect<void, DisparityError>
  <Input, OutputA, OutputB, E>(
    targetA: (input: Input) => Effect.Effect<OutputA, E>,
    targetB: (input: Input) => Effect.Effect<OutputB, E>,
    arb: fc.Arbitrary<Input>,
    oracle: (outputA: OutputA, outputB: OutputB) => boolean,
    options?: DualExecutionSupervisorOptions,
  ): Effect.Effect<void, DisparityError>
} = Function.dual((args: IArguments) => typeof args[3] === 'function', runDifferentialWithShrinkImpl)

const runMetamorphicWithShrinkImpl = <Input, Output, E>(
  system: (input: Input) => Effect.Effect<Output, E>,
  arb: fc.Arbitrary<Input>,
  transformInput: (input: Input) => Input,
  relation: (outputA: Output, outputB: Output) => boolean,
  options?: DualExecutionSupervisorOptions,
): Effect.Effect<void, DisparityError> =>
  Effect.flatMap(
    checkWithShrink(arb, (seed: Input) => dualHolds(system, system, seed, transformInput(seed), relation), options),
    (details) => failWithDisparity(system, system, transformInput, (seed, followUp) => ({ seed, followUp }), details),
  )

export const runMetamorphicWithShrink: {
  <Input, Output, E>(
    arb: fc.Arbitrary<Input>,
    transformInput: (input: Input) => Input,
    relation: (outputA: Output, outputB: Output) => boolean,
    options?: DualExecutionSupervisorOptions,
  ): (system: (input: Input) => Effect.Effect<Output, E>) => Effect.Effect<void, DisparityError>
  <Input, Output, E>(
    system: (input: Input) => Effect.Effect<Output, E>,
    arb: fc.Arbitrary<Input>,
    transformInput: (input: Input) => Input,
    relation: (outputA: Output, outputB: Output) => boolean,
    options?: DualExecutionSupervisorOptions,
  ): Effect.Effect<void, DisparityError>
} = Function.dual((args: IArguments) => typeof args[3] === 'function', runMetamorphicWithShrinkImpl)
