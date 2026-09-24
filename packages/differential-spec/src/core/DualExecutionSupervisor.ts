import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Cause, Effect, Exit, Fiber, Function } from 'effect'
import * as fc from 'fast-check'

import { DisparityError } from './DisparityError.schema.js'
import { formatDisparity, renderExit, renderUnknown } from './DisparityReporter.js'

export interface DualExecutionSupervisorOptions {
  readonly runBudget?: number
  readonly interruptAfterTimeLimit?: number
}

type Exits<OutputA, OutputB, E> = readonly [Exit.Exit<OutputA, E>, Exit.Exit<OutputB, E>]

type DualProgram<OutputA, OutputB, E> = Effect.Effect<Exits<OutputA, OutputB, E>>

type DualRun<OutputA, OutputB, E> = Kernel.RunResult<Exits<OutputA, OutputB, E>, never>

const runDualImpl = <InputA, InputB, OutputA, OutputB, E>(
  targetA: (input: InputA) => Effect.Effect<OutputA, E>,
  targetB: (input: InputB) => Effect.Effect<OutputB, E>,
  inputA: InputA,
  inputB: InputB,
): DualProgram<OutputA, OutputB, E> =>
  Effect.gen(function*() {
    const reference = yield* Effect.forkChild(Effect.exit(targetA(inputA)))
    const candidate = yield* Effect.forkChild(Effect.exit(targetB(inputB)))
    const referenceOutcome = yield* Fiber.join(reference)
    const candidateOutcome = yield* Fiber.join(candidate)
    return [referenceOutcome, candidateOutcome]
  })

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

const judgeExits = <OutputA, OutputB, E>(
  exits: Exits<OutputA, OutputB, E>,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): boolean => (bothSucceeded(exits) ? oracle(exits[0].value, exits[1].value) : failuresMatch(exits))

const completedExitOf = <A, E>(run: Kernel.RunResult<A, never>): Exit.Exit<A, E> | undefined =>
  'exit' in run ? run.exit : undefined

const successValueOf = <A, E>(exit: Exit.Exit<A, E>): A | undefined => (Exit.isSuccess(exit) ? exit.value : undefined)

const outcomeOf = <OutputA, OutputB, E>(
  run: DualRun<OutputA, OutputB, E>,
): Exits<OutputA, OutputB, E> | undefined => {
  const completed = completedExitOf(run)
  return completed === undefined ? undefined : successValueOf(completed)
}

const holds = <OutputA, OutputB, E>(
  run: DualRun<OutputA, OutputB, E>,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): boolean => {
  const outcome = outcomeOf(run)
  return outcome === undefined ? false : judgeExits(outcome, oracle)
}

const disagrees = <OutputA, OutputB, E>(
  run: DualRun<OutputA, OutputB, E>,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): boolean => !holds(run, oracle)

interface Attempt<OutputA, OutputB, E> {
  readonly run: DualRun<OutputA, OutputB, E>
  readonly schedule: string
}

const ORDER_SCHEDULE = 'effect order'

const attemptOn = <OutputA, OutputB, E>(
  run: DualRun<OutputA, OutputB, E>,
  schedule: string,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): Attempt<OutputA, OutputB, E> | undefined => (disagrees(run, oracle) ? { run, schedule } : undefined)

interface CaseRuns<OutputA, OutputB, E> {
  readonly order: DualRun<OutputA, OutputB, E>
  readonly seeded: DualRun<OutputA, OutputB, E>
}

const caseRunsOf = <OutputA, OutputB, E>(
  program: DualProgram<OutputA, OutputB, E>,
  seed: number,
): Promise<CaseRuns<OutputA, OutputB, E>> =>
  Kernel.run(program).then((order) => {
    const options = { choose: Kernel.pick({ seed, depth: Kernel.pctDepth, steps: order.steps.length }) }
    return Kernel.run(program, options).then((seeded) => ({ order, seeded }))
  })

const disagreementOf = <OutputA, OutputB, E>(
  runs: CaseRuns<OutputA, OutputB, E>,
  seed: number,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
): Attempt<OutputA, OutputB, E> | undefined => {
  if (disagrees(runs.order, oracle)) return { run: runs.order, schedule: ORDER_SCHEDULE }
  return attemptOn(runs.seeded, `pct seed ${seed}`, oracle)
}

const DEFAULT_OPTIONS = {
  runBudget: 100,
  interruptAfterTimeLimit: 5000,
} as const

const toFcParameters = <Input>(
  options?: DualExecutionSupervisorOptions,
): fc.Parameters<[Input, number]> => {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  return { numRuns: merged.runBudget, interruptAfterTimeLimit: merged.interruptAfterTimeLimit }
}

const reproOf = (seed: number, path: string | undefined): string =>
  `fc.check(property, { seed: ${seed}, path: "${path ?? ''}" })`

type FailedCase<Input> = Extract<
  fc.RunDetails<[Input, number]>,
  { readonly failed: true; readonly counterexample: [Input, number] }
>

const isFailedWithCounterexample = <Input>(
  details: fc.RunDetails<[Input, number]>,
): details is FailedCase<Input> => details.failed && details.counterexample !== null

const inconclusiveReport = <Input>(details: fc.RunDetails<[Input, number]>): DisparityError =>
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
  details: FailedCase<Input>,
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

interface DisparitySides {
  readonly outputA: string
  readonly outputB: string
}

const UNEXECUTED_SIDES: DisparitySides = { outputA: '(not executed)', outputB: '(not executed)' }

const renderedSidesOf = <OutputA, OutputB, E>(outcome: Exits<OutputA, OutputB, E> | undefined): DisparitySides =>
  outcome === undefined
    ? UNEXECUTED_SIDES
    : { outputA: renderExit(outcome[0]), outputB: renderExit(outcome[1]) }

const scheduleTraceOf = <Input, OutputA, OutputB, E>(
  details: FailedCase<Input>,
  schedule: string,
  shrunk: Kernel.ShrinkOutcome<Exits<OutputA, OutputB, E>, never>,
): string => {
  const kernel = 'failure' in shrunk.result ? ` kernel reported ${renderUnknown(shrunk.result.failure)}` : ''
  return `fc seed ${details.seed}, path "${details.counterexamplePath}"; schedule: ${schedule},` +
    ` deviations ${shrunk.deviations}, steps ${shrunk.result.steps.length},` +
    ` path [${shrunk.path.map(String).join(',')}],${kernel}`
}

const disparityOf = <Input, Described, OutputA, OutputB, E>(
  details: FailedCase<Input>,
  described: Described,
  schedule: string,
  shrunk: Kernel.ShrinkOutcome<Exits<OutputA, OutputB, E>, never>,
): DisparityError => {
  const sides = renderedSidesOf(outcomeOf(shrunk.result))
  return new DisparityError({
    report: formatDisparity({
      input: described,
      outputA: sides.outputA,
      outputB: sides.outputB,
      trace: scheduleTraceOf(details, schedule, shrunk),
      reproSnippet: reproOf(details.seed, details.counterexamplePath),
    }),
  })
}

interface Comparison<Input, Described, OutputA, OutputB, E> {
  readonly targetA: (input: Input) => Effect.Effect<OutputA, E>
  readonly targetB: (input: Input) => Effect.Effect<OutputB, E>
  readonly secondInput: (input: Input) => Input
  readonly describeInput: (input: Input, followUp: Input) => Described
  readonly arb: fc.Arbitrary<Input>
  readonly oracle: (outputA: OutputA, outputB: OutputB) => boolean
  readonly options?: DualExecutionSupervisorOptions | undefined
}

const programOf = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  input: Input,
): DualProgram<OutputA, OutputB, E> | undefined => {
  const followUp = followUpOf(comparison.secondInput, input)
  return followUp.ok
    ? runDualImpl(comparison.targetA, comparison.targetB, input, followUp.value)
    : undefined
}

const caseHolds = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  input: Input,
  seed: number,
): Promise<boolean> => {
  const program = programOf(comparison, input)
  if (program === undefined) return Promise.resolve(false)
  return caseRunsOf(program, seed).then((runs) => disagreementOf(runs, seed, comparison.oracle) === undefined)
}

type Field<A = unknown> = A

const renderThrown = (thrown: Field): string => {
  if (thrown instanceof Error) return `${thrown.name}: ${thrown.message}`
  return renderUnknown(thrown)
}

const contradictionReport = <Input, Described, OutputA, OutputB, E>(
  details: FailedCase<Input>,
  described: Described,
  runs: CaseRuns<OutputA, OutputB, E>,
): DisparityError => {
  const order = renderedSidesOf(outcomeOf(runs.order))
  const seeded = renderedSidesOf(outcomeOf(runs.seeded))
  const thrown = details.errorInstance === null
    ? ''
    : ` the generated case threw: ${renderThrown(details.errorInstance)}`
  return new DisparityError({
    report: formatDisparity({
      input: described,
      outputA: `replayed order run: ${order.outputA} | seeded run: ${seeded.outputA}`,
      outputB: `replayed order run: ${order.outputB} | seeded run: ${seeded.outputB}`,
      trace:
        `fc seed ${details.seed}, path "${details.counterexamplePath}"; the generated case replayed without a disagreement.${thrown}`,
      reproSnippet: reproOf(details.seed, details.counterexamplePath),
    }),
  })
}

const SEARCH_SCHEDULE = 'search with 1 preemption'

const searchedReportOf = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  details: FailedCase<Input>,
  described: Described,
  program: DualProgram<OutputA, OutputB, E>,
  found: Kernel.SearchFailure<Exits<OutputA, OutputB, E>, never>,
): Promise<DisparityError> =>
  Kernel.shrink(program, {
    path: found.path,
    isFailure: (run: DualRun<OutputA, OutputB, E>) => disagrees(run, comparison.oracle),
  }).then((shrunk) => disparityOf(details, described, SEARCH_SCHEDULE, shrunk))

const caseReportOf = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  details: FailedCase<Input>,
  described: Described,
  seed: number,
  program: DualProgram<OutputA, OutputB, E>,
  runs: CaseRuns<OutputA, OutputB, E>,
): Promise<DisparityError> => {
  const attempt = disagreementOf(runs, seed, comparison.oracle)
  if (attempt === undefined) return Promise.resolve(contradictionReport(details, described, runs))
  return Kernel.shrink(program, {
    path: attempt.run.decisions,
    isFailure: (run: DualRun<OutputA, OutputB, E>) => disagrees(run, comparison.oracle),
  }).then((shrunk) => disparityOf(details, described, attempt.schedule, shrunk))
}

const shrunkReportOf = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  details: FailedCase<Input>,
  described: Described,
  seed: number,
  program: DualProgram<OutputA, OutputB, E>,
): Promise<DisparityError> =>
  caseRunsOf(program, seed).then((runs) =>
    Kernel.search(program, {
      preemptions: 1,
      isFailure: (run: DualRun<OutputA, OutputB, E>) => disagrees(run, comparison.oracle),
    }).then((outcome) => {
      const found = outcome.failures[0]
      if (found === undefined) return caseReportOf(comparison, details, described, seed, program, runs)
      return searchedReportOf(comparison, details, described, program, found)
    })
  )

const counterexampleReport = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  details: FailedCase<Input>,
  input: Input,
  seed: number,
): Promise<DisparityError> => {
  const followUp = followUpOf(comparison.secondInput, input)
  if (!followUp.ok) return Promise.resolve(transformThrewReport(details, input, followUp.error))
  const program = runDualImpl(comparison.targetA, comparison.targetB, input, followUp.value)
  const described = comparison.describeInput(input, followUp.value)
  return shrunkReportOf(comparison, details, described, seed, program)
}

const failureReportOf = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
  details: fc.RunDetails<[Input, number]>,
): Promise<DisparityError> => {
  if (!isFailedWithCounterexample(details)) return Promise.resolve(inconclusiveReport(details))
  const [input, seed] = details.counterexample
  return counterexampleReport(comparison, details, input, seed)
}

const isReported = <Input>(details: fc.RunDetails<[Input, number]>): boolean => details.failed || details.interrupted

const checked = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
): Promise<DisparityError | undefined> => {
  const property = fc.asyncProperty(
    comparison.arb,
    fc.nat(),
    (input: Input, seed: number) => caseHolds(comparison, input, seed),
  )
  return fc.check(property, toFcParameters<Input>(comparison.options)).then((details) =>
    isReported(details) ? failureReportOf(comparison, details) : undefined
  )
}

const fromOutcome = (failure: DisparityError | undefined): Effect.Effect<void, DisparityError> =>
  failure === undefined ? Effect.void : Effect.fail(failure)

const supervised = <Input, Described, OutputA, OutputB, E>(
  comparison: Comparison<Input, Described, OutputA, OutputB, E>,
): Effect.Effect<void, DisparityError> =>
  Effect.flatMap(
    Effect.promise(() => checked(comparison)),
    fromOutcome,
  )

const runDifferentialWithShrinkImpl = <Input, OutputA, OutputB, E>(
  targetA: (input: Input) => Effect.Effect<OutputA, E>,
  targetB: (input: Input) => Effect.Effect<OutputB, E>,
  arb: fc.Arbitrary<Input>,
  oracle: (outputA: OutputA, outputB: OutputB) => boolean,
  options?: DualExecutionSupervisorOptions,
): Effect.Effect<void, DisparityError> =>
  supervised({
    targetA,
    targetB,
    secondInput: Function.identity,
    describeInput: Function.identity,
    arb,
    oracle,
    options,
  })

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

const metamorphicDescription = <Input>(
  seed: Input,
  followUp: Input,
): { readonly seed: Input; readonly followUp: Input } => ({ seed, followUp })

const runMetamorphicWithShrinkImpl = <Input, Output, E>(
  system: (input: Input) => Effect.Effect<Output, E>,
  arb: fc.Arbitrary<Input>,
  transformInput: (input: Input) => Input,
  relation: (outputA: Output, outputB: Output) => boolean,
  options?: DualExecutionSupervisorOptions,
): Effect.Effect<void, DisparityError> =>
  supervised({
    targetA: system,
    targetB: system,
    secondInput: transformInput,
    describeInput: metamorphicDescription,
    arb,
    oracle: relation,
    options,
  })

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
