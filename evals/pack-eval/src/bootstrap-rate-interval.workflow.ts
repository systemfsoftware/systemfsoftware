import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Number as Num, Option, Order, Schema } from 'effect'
import * as Result from 'effect/Result'

const BootstrapRateIntervalDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/pack-eval/BootstrapRateIntervalDecision',
)
type BootstrapRateIntervalDecisionTypeId = typeof BootstrapRateIntervalDecisionTypeId

export class BootstrapRateIntervalRate extends Schema.TaggedClass<BootstrapRateIntervalRate>()(
  'BootstrapRateIntervalRate',
  {
    rate: Schema.Finite,
    lower: Schema.Finite,
    upper: Schema.Finite,
  },
) {
  readonly [BootstrapRateIntervalDecisionTypeId] = BootstrapRateIntervalDecisionTypeId
}

export class BootstrapRateIntervalNoItems extends Schema.TaggedClass<BootstrapRateIntervalNoItems>()(
  'BootstrapRateIntervalNoItems',
  {},
) {
  readonly [BootstrapRateIntervalDecisionTypeId] = BootstrapRateIntervalDecisionTypeId
}

export const BootstrapRateIntervalDecision = Schema.Union([BootstrapRateIntervalRate, BootstrapRateIntervalNoItems])
export type BootstrapRateIntervalDecision = typeof BootstrapRateIntervalDecision.Type

export class BootstrapRateIntervalNonBinaryValue extends Schema.TaggedError<BootstrapRateIntervalNonBinaryValue>()(
  'BootstrapRateIntervalNonBinaryValue',
  { value: Schema.Finite },
) {}

export class BootstrapRateIntervalInvalidConfidence
  extends Schema.TaggedError<BootstrapRateIntervalInvalidConfidence>()(
    'BootstrapRateIntervalInvalidConfidence',
    { confidence: Schema.Finite },
  )
{}

export class BootstrapRateIntervalZeroIterations extends Schema.TaggedError<BootstrapRateIntervalZeroIterations>()(
  'BootstrapRateIntervalZeroIterations',
  { iterations: Schema.Finite },
) {}

export const BootstrapRateIntervalError = Schema.Union([
  BootstrapRateIntervalInvalidConfidence,
  BootstrapRateIntervalZeroIterations,
  BootstrapRateIntervalNonBinaryValue,
])
export type BootstrapRateIntervalError = typeof BootstrapRateIntervalError.Type

export class BootstrapRateIntervalCommand extends Schema.TaggedClass<BootstrapRateIntervalCommand>()(
  'BootstrapRateIntervalCommand',
  {
    outcomes: Schema.Array(Schema.Finite),
    iterations: Schema.Finite,
    confidence: Schema.Finite,
    seed: Schema.Finite,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const imul32 = (left: number, right: number): number => {
  const leftHigh = (left >>> 16) & 0xffff
  const leftLow = left & 0xffff
  const rightHigh = (right >>> 16) & 0xffff
  const rightLow = right & 0xffff
  return (leftLow * rightLow + (((leftHigh * rightLow + leftLow * rightHigh) & 0xffff) << 16)) | 0
}

const splitmix32 = (state: number): number => {
  const mixed = (state + 0x9e3779b9) | 0
  const doubled = imul32(mixed ^ (mixed >>> 16), 0x85ebca6b)
  const tripled = imul32(doubled ^ (doubled >>> 13), 0xc2b2ae35)
  return (tripled ^ (tripled >>> 16)) >>> 0
}

const unitAt = (seed: number, index: number): number => splitmix32((seed ^ imul32(index, 0x9e3779b9)) | 0) / 4294967296

const floorOf = (value: number): number => value - (value % 1)

const pickAt = (unit: number, size: number): number => floorOf(unit * size)

const picksOf = (seed: number, iteration: number, size: number): ReadonlyArray<number> =>
  Arr.makeBy(size, (position) => pickAt(unitAt(seed, iteration * size + position), size))

const atOf = (values: ReadonlyArray<number>, index: number): number =>
  Arr.get(values, index).pipe(Option.getOrElse(() => 0))

const resampledMeanOf = (seed: number, iteration: number, outcomes: ReadonlyArray<number>): number =>
  Arr.reduce(picksOf(seed, iteration, outcomes.length), 0, (total, pick) => total + atOf(outcomes, pick)) /
  outcomes.length

const linearPercentileOf = (sorted: ReadonlyArray<number>, percentile: number): number => {
  const lastIndex = sorted.length - 1
  const position = (percentile / 100) * lastIndex
  const lowerIndex = floorOf(position)
  const upperIndex = Num.min(lowerIndex + 1, lastIndex)
  const lower = atOf(sorted, lowerIndex)
  const upper = atOf(sorted, upperIndex)
  return lower + (upper - lower) * (position - lowerIndex)
}

const meanOf = (outcomes: ReadonlyArray<number>): number =>
  Arr.reduce(outcomes, 0, (total, outcome) => total + outcome) / outcomes.length

const intervalOf = (
  outcomes: ReadonlyArray<number>,
  iterations: number,
  confidence: number,
  seed: number,
): { readonly lower: number; readonly upper: number } => {
  const sorted = Arr.sort(Order.Number)(
    Arr.makeBy(iterations, (iteration) => resampledMeanOf(seed, iteration, outcomes)),
  )
  const alpha = 1 - confidence
  return {
    lower: linearPercentileOf(sorted, (alpha / 2) * 100),
    upper: linearPercentileOf(sorted, (1 - alpha / 2) * 100),
  }
}

const confidenceCheckOf = (confidence: number): Option.Option<BootstrapRateIntervalError> =>
  Match.value(confidence > 0).pipe(
    Match.when(false, () => Option.some(new BootstrapRateIntervalInvalidConfidence({ confidence }))),
    Match.when(true, () =>
      Match.value(confidence < 1).pipe(
        Match.when(true, () => Option.none<BootstrapRateIntervalError>()),
        Match.when(false, () => Option.some(new BootstrapRateIntervalInvalidConfidence({ confidence }))),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const iterationsCheckOf = (iterations: number): Option.Option<BootstrapRateIntervalError> =>
  Match.value(iterations > 0).pipe(
    Match.when(true, () => Option.none<BootstrapRateIntervalError>()),
    Match.when(false, () => Option.some(new BootstrapRateIntervalZeroIterations({ iterations }))),
    Match.exhaustive,
  )

const binaryCheckOf = (outcomes: ReadonlyArray<number>): Option.Option<BootstrapRateIntervalError> =>
  Arr.findFirst(outcomes, (outcome) => outcome * (outcome - 1) !== 0).pipe(
    Option.match({
      onNone: () => Option.none<BootstrapRateIntervalError>(),
      onSome: (value) => Option.some(new BootstrapRateIntervalNonBinaryValue({ value })),
    }),
  )

const refusalOf = (command: BootstrapRateIntervalCommand): Option.Option<BootstrapRateIntervalError> =>
  Arr.findFirst(
    [
      confidenceCheckOf(command.confidence),
      iterationsCheckOf(command.iterations),
      binaryCheckOf(command.outcomes),
    ],
    (check) => check,
  )

class RefusedOutcome extends Schema.TaggedClass<RefusedOutcome>()('RefusedOutcome', {
  error: BootstrapRateIntervalError,
}) {}
class RatedOutcome extends Schema.TaggedClass<RatedOutcome>()('RatedOutcome', {
  rate: Schema.Finite,
  lower: Schema.Finite,
  upper: Schema.Finite,
}) {}
class ItemsMissingOutcome extends Schema.TaggedClass<ItemsMissingOutcome>()('ItemsMissingOutcome', {}) {}

type StepOutcome = RefusedOutcome | RatedOutcome | ItemsMissingOutcome

const stepOutcomeOf = (command: BootstrapRateIntervalCommand): RatedOutcome | ItemsMissingOutcome =>
  Match.value(command.outcomes.length === 0).pipe(
    Match.when(true, (): RatedOutcome | ItemsMissingOutcome => new ItemsMissingOutcome()),
    Match.when(
      false,
      (): RatedOutcome | ItemsMissingOutcome =>
        new RatedOutcome({
          rate: meanOf(command.outcomes),
          ...intervalOf(command.outcomes, command.iterations, command.confidence, command.seed),
        }),
    ),
    Match.exhaustive,
  )

const classify = (command: BootstrapRateIntervalCommand): StepOutcome =>
  Option.match(refusalOf(command), {
    onNone: () => stepOutcomeOf(command),
    onSome: (error) => new RefusedOutcome({ error }),
  })

export const bootstrapRateInterval = Workflow.make({
  command: BootstrapRateIntervalCommand,
  decision: BootstrapRateIntervalDecision,
  error: BootstrapRateIntervalError,
  decide: (command): Result.Result<BootstrapRateIntervalDecision, BootstrapRateIntervalError> =>
    Match.value(classify(command)).pipe(
      Match.tag('RefusedOutcome', (outcome) => Result.fail(outcome.error)),
      Match.tag(
        'RatedOutcome',
        (outcome) =>
          Result.succeed(
            new BootstrapRateIntervalRate({ rate: outcome.rate, lower: outcome.lower, upper: outcome.upper }),
          ),
      ),
      Match.tag('ItemsMissingOutcome', () => Result.succeed(new BootstrapRateIntervalNoItems())),
      Match.exhaustive,
    ),
})
