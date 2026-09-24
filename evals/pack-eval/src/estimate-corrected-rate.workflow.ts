import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Number as Num, Option, Order, Schema } from 'effect'
import * as Result from 'effect/Result'

const EstimateCorrectedRateDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/pack-eval/EstimateCorrectedRateDecision',
)
type EstimateCorrectedRateDecisionTypeId = typeof EstimateCorrectedRateDecisionTypeId

export class EstimateCorrectedRateEstimate extends Schema.TaggedClass<EstimateCorrectedRateEstimate>()(
  'EstimateCorrectedRateEstimate',
  {
    estimate: Schema.Finite,
    lower: Schema.Finite,
    upper: Schema.Finite,
  },
) {
  readonly [EstimateCorrectedRateDecisionTypeId] = EstimateCorrectedRateDecisionTypeId
}

export class EstimateCorrectedRateNoValidSamples extends Schema.TaggedClass<EstimateCorrectedRateNoValidSamples>()(
  'EstimateCorrectedRateNoValidSamples',
  {
    estimate: Schema.Finite,
  },
) {
  readonly [EstimateCorrectedRateDecisionTypeId] = EstimateCorrectedRateDecisionTypeId
}

export const EstimateCorrectedRateDecision = Schema.Union([
  EstimateCorrectedRateEstimate,
  EstimateCorrectedRateNoValidSamples,
])
export type EstimateCorrectedRateDecision = typeof EstimateCorrectedRateDecision.Type

const EstimateCorrectedRateField = Schema.Literals(['testLabels', 'testPredictions', 'unlabeledPredictions'])

export class EstimateCorrectedRateEmptyInput extends Schema.TaggedError<EstimateCorrectedRateEmptyInput>()(
  'EstimateCorrectedRateEmptyInput',
  { field: EstimateCorrectedRateField },
) {}

export class EstimateCorrectedRateNonBinaryValue extends Schema.TaggedError<EstimateCorrectedRateNonBinaryValue>()(
  'EstimateCorrectedRateNonBinaryValue',
  { field: EstimateCorrectedRateField, value: Schema.Finite },
) {}

export class EstimateCorrectedRateLengthMismatch extends Schema.TaggedError<EstimateCorrectedRateLengthMismatch>()(
  'EstimateCorrectedRateLengthMismatch',
  { testLabels: Schema.Finite, testPredictions: Schema.Finite },
) {}

export class EstimateCorrectedRateOneClassTestLabels
  extends Schema.TaggedError<EstimateCorrectedRateOneClassTestLabels>()(
    'EstimateCorrectedRateOneClassTestLabels',
    { positives: Schema.Finite, negatives: Schema.Finite },
  )
{}

export class EstimateCorrectedRateNoBetterThanRandom
  extends Schema.TaggedError<EstimateCorrectedRateNoBetterThanRandom>()(
    'EstimateCorrectedRateNoBetterThanRandom',
    { truePositiveRate: Schema.Finite, trueNegativeRate: Schema.Finite },
  )
{}

export class EstimateCorrectedRateInvalidConfidence
  extends Schema.TaggedError<EstimateCorrectedRateInvalidConfidence>()(
    'EstimateCorrectedRateInvalidConfidence',
    { confidence: Schema.Finite },
  )
{}

export class EstimateCorrectedRateZeroIterations extends Schema.TaggedError<EstimateCorrectedRateZeroIterations>()(
  'EstimateCorrectedRateZeroIterations',
  { iterations: Schema.Finite },
) {}

export const EstimateCorrectedRateError = Schema.Union([
  EstimateCorrectedRateInvalidConfidence,
  EstimateCorrectedRateZeroIterations,
  EstimateCorrectedRateLengthMismatch,
  EstimateCorrectedRateEmptyInput,
  EstimateCorrectedRateNonBinaryValue,
  EstimateCorrectedRateOneClassTestLabels,
  EstimateCorrectedRateNoBetterThanRandom,
])
export type EstimateCorrectedRateError = typeof EstimateCorrectedRateError.Type

export class EstimateCorrectedRateCommand extends Schema.TaggedClass<EstimateCorrectedRateCommand>()(
  'EstimateCorrectedRateCommand',
  {
    testLabels: Schema.Array(Schema.Finite),
    testPredictions: Schema.Array(Schema.Finite),
    unlabeledPredictions: Schema.Array(Schema.Finite),
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

const indicatorOf = (holds: boolean): number => Number(holds)

const sumOf = (values: ReadonlyArray<number>): number => Arr.reduce(values, 0, (total, value) => total + value)

const observedRateOf = (predictions: ReadonlyArray<number>): number => sumOf(predictions) / predictions.length

const correctedOf = (
  observedPassRate: number,
  truePositiveRate: number,
  trueNegativeRate: number,
): number =>
  Num.clamp(
    (observedPassRate + trueNegativeRate - 1) / (truePositiveRate + trueNegativeRate - 1),
    { minimum: 0, maximum: 1 },
  )

const truePositiveCountOf = (
  testLabels: ReadonlyArray<number>,
  testPredictions: ReadonlyArray<number>,
): number => Arr.reduce(testLabels, 0, (total, label, index) => total + label * atOf(testPredictions, index))

const trueNegativeCountOf = (
  testLabels: ReadonlyArray<number>,
  testPredictions: ReadonlyArray<number>,
): number =>
  Arr.reduce(
    testLabels,
    0,
    (total, label, index) => total + (1 - label) * (1 - atOf(testPredictions, index)),
  )

const pointEstimateOf = (command: EstimateCorrectedRateCommand): number => {
  const positives = sumOf(command.testLabels)
  const negatives = command.testLabels.length - positives
  const truePositiveRate = truePositiveCountOf(command.testLabels, command.testPredictions) / positives
  const trueNegativeRate = trueNegativeCountOf(command.testLabels, command.testPredictions) / negatives
  return correctedOf(observedRateOf(command.unlabeledPredictions), truePositiveRate, trueNegativeRate)
}

const sampleOf = (
  command: EstimateCorrectedRateCommand,
  iteration: number,
): { readonly holds: boolean; readonly theta: number } => {
  const size = command.testLabels.length
  const picks = picksOf(command.seed, iteration, size)
  const positives = Arr.reduce(picks, 0, (total, pick) => total + atOf(command.testLabels, pick))
  const negatives = size - positives
  const truePositives = Arr.reduce(
    picks,
    0,
    (total, pick) => total + atOf(command.testLabels, pick) * atOf(command.testPredictions, pick),
  )
  const trueNegatives = Arr.reduce(
    picks,
    0,
    (total, pick) => total + (1 - atOf(command.testLabels, pick)) * (1 - atOf(command.testPredictions, pick)),
  )
  const truePositiveRate = truePositives / positives
  const trueNegativeRate = trueNegatives / negatives
  const denominator = truePositiveRate + trueNegativeRate - 1
  const holds = indicatorOf(positives * negatives > 0) * indicatorOf(denominator > 0) === 1
  return {
    holds,
    theta: correctedOf(observedRateOf(command.unlabeledPredictions), truePositiveRate, trueNegativeRate),
  }
}

const sortedSamplesOf = (command: EstimateCorrectedRateCommand): ReadonlyArray<number> => {
  const samples = Arr.makeBy(command.iterations, (iteration) => sampleOf(command, iteration))
  return Arr.sort(Order.Number)(Arr.map(Arr.filter(samples, (sample) => sample.holds), (sample) => sample.theta))
}

const linearPercentileOf = (sorted: ReadonlyArray<number>, percentile: number): number => {
  const lastIndex = sorted.length - 1
  const position = (percentile / 100) * lastIndex
  const lowerIndex = floorOf(position)
  const upperIndex = Num.min(lowerIndex + 1, lastIndex)
  const lower = atOf(sorted, lowerIndex)
  const upper = atOf(sorted, upperIndex)
  return lower + (upper - lower) * (position - lowerIndex)
}

const intervalOf = (command: EstimateCorrectedRateCommand): { readonly lower: number; readonly upper: number } => {
  const sorted = sortedSamplesOf(command)
  const alpha = 1 - command.confidence
  return {
    lower: linearPercentileOf(sorted, (alpha / 2) * 100),
    upper: linearPercentileOf(sorted, (1 - alpha / 2) * 100),
  }
}

const confidenceCheckOf = (confidence: number): Option.Option<EstimateCorrectedRateError> =>
  Match.value(confidence > 0).pipe(
    Match.when(false, () => Option.some(new EstimateCorrectedRateInvalidConfidence({ confidence }))),
    Match.when(true, () =>
      Match.value(confidence < 1).pipe(
        Match.when(true, () => Option.none<EstimateCorrectedRateError>()),
        Match.when(false, () => Option.some(new EstimateCorrectedRateInvalidConfidence({ confidence }))),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const iterationsCheckOf = (iterations: number): Option.Option<EstimateCorrectedRateError> =>
  Match.value(iterations > 0).pipe(
    Match.when(true, () => Option.none<EstimateCorrectedRateError>()),
    Match.when(false, () => Option.some(new EstimateCorrectedRateZeroIterations({ iterations }))),
    Match.exhaustive,
  )

const lengthCheckOf = (
  testLabels: ReadonlyArray<number>,
  testPredictions: ReadonlyArray<number>,
): Option.Option<EstimateCorrectedRateError> =>
  Match.value(testLabels.length === testPredictions.length).pipe(
    Match.when(true, () => Option.none<EstimateCorrectedRateError>()),
    Match.when(
      false,
      () =>
        Option.some(
          new EstimateCorrectedRateLengthMismatch({
            testLabels: testLabels.length,
            testPredictions: testPredictions.length,
          }),
        ),
    ),
    Match.exhaustive,
  )

const emptyCheckOf = (
  field: typeof EstimateCorrectedRateField.Type,
  length: number,
): Option.Option<EstimateCorrectedRateError> =>
  Match.value(length === 0).pipe(
    Match.when(true, () => Option.some(new EstimateCorrectedRateEmptyInput({ field }))),
    Match.when(false, () => Option.none<EstimateCorrectedRateError>()),
    Match.exhaustive,
  )

const binaryCheckOf = (
  field: typeof EstimateCorrectedRateField.Type,
  values: ReadonlyArray<number>,
): Option.Option<EstimateCorrectedRateError> =>
  Arr.findFirst(values, (value) => value * (value - 1) !== 0).pipe(
    Option.match({
      onNone: () => Option.none<EstimateCorrectedRateError>(),
      onSome: (value) => Option.some(new EstimateCorrectedRateNonBinaryValue({ field, value })),
    }),
  )

const classCheckOf = (testLabels: ReadonlyArray<number>): Option.Option<EstimateCorrectedRateError> => {
  const positives = sumOf(testLabels)
  const negatives = testLabels.length - positives
  return Match.value(positives * negatives === 0).pipe(
    Match.when(true, () => Option.some(new EstimateCorrectedRateOneClassTestLabels({ positives, negatives }))),
    Match.when(false, () => Option.none<EstimateCorrectedRateError>()),
    Match.exhaustive,
  )
}

const accuracyCheckOf = (
  testLabels: ReadonlyArray<number>,
  testPredictions: ReadonlyArray<number>,
): Option.Option<EstimateCorrectedRateError> => {
  const positives = sumOf(testLabels)
  const negatives = testLabels.length - positives
  const truePositiveRate = truePositiveCountOf(testLabels, testPredictions) / positives
  const trueNegativeRate = trueNegativeCountOf(testLabels, testPredictions) / negatives
  return Match.value(truePositiveRate + trueNegativeRate > 1).pipe(
    Match.when(true, () => Option.none<EstimateCorrectedRateError>()),
    Match.when(
      false,
      () => Option.some(new EstimateCorrectedRateNoBetterThanRandom({ truePositiveRate, trueNegativeRate })),
    ),
    Match.exhaustive,
  )
}

const refusalOf = (command: EstimateCorrectedRateCommand): Option.Option<EstimateCorrectedRateError> =>
  Arr.findFirst(
    [
      () => confidenceCheckOf(command.confidence),
      () => iterationsCheckOf(command.iterations),
      () => lengthCheckOf(command.testLabels, command.testPredictions),
      () => emptyCheckOf('testLabels', command.testLabels.length),
      () => emptyCheckOf('unlabeledPredictions', command.unlabeledPredictions.length),
      () => binaryCheckOf('testLabels', command.testLabels),
      () => binaryCheckOf('testPredictions', command.testPredictions),
      () => binaryCheckOf('unlabeledPredictions', command.unlabeledPredictions),
      () => classCheckOf(command.testLabels),
      () => accuracyCheckOf(command.testLabels, command.testPredictions),
    ],
    (check) => check(),
  )

class RefusedOutcome extends Schema.TaggedClass<RefusedOutcome>()('RefusedOutcome', {
  error: EstimateCorrectedRateError,
}) {}
class EstimatedOutcome extends Schema.TaggedClass<EstimatedOutcome>()('EstimatedOutcome', {
  estimate: Schema.Finite,
  lower: Schema.Finite,
  upper: Schema.Finite,
}) {}
class UnsampledOutcome extends Schema.TaggedClass<UnsampledOutcome>()('UnsampledOutcome', {
  estimate: Schema.Finite,
}) {}

type StepOutcome = RefusedOutcome | EstimatedOutcome | UnsampledOutcome

const stepOutcomeOf = (command: EstimateCorrectedRateCommand): EstimatedOutcome | UnsampledOutcome => {
  const sorted = sortedSamplesOf(command)
  const estimate = pointEstimateOf(command)
  const interval = intervalOf(command)
  return Match.value(sorted.length > 0).pipe(
    Match.when(
      true,
      (): EstimatedOutcome | UnsampledOutcome =>
        new EstimatedOutcome({ estimate, lower: interval.lower, upper: interval.upper }),
    ),
    Match.when(false, (): EstimatedOutcome | UnsampledOutcome => new UnsampledOutcome({ estimate })),
    Match.exhaustive,
  )
}

const classify = (command: EstimateCorrectedRateCommand): StepOutcome =>
  Option.match(refusalOf(command), {
    onNone: () => stepOutcomeOf(command),
    onSome: (error) => new RefusedOutcome({ error }),
  })

export const estimateCorrectedRate = Workflow.make({
  command: EstimateCorrectedRateCommand,
  decision: EstimateCorrectedRateDecision,
  error: EstimateCorrectedRateError,
  decide: (command): Result.Result<EstimateCorrectedRateDecision, EstimateCorrectedRateError> =>
    Match.value(classify(command)).pipe(
      Match.tag('RefusedOutcome', (outcome) => Result.fail(outcome.error)),
      Match.tag(
        'EstimatedOutcome',
        (outcome) =>
          Result.succeed(
            new EstimateCorrectedRateEstimate({
              estimate: outcome.estimate,
              lower: outcome.lower,
              upper: outcome.upper,
            }),
          ),
      ),
      Match.tag(
        'UnsampledOutcome',
        (outcome) => Result.succeed(new EstimateCorrectedRateNoValidSamples({ estimate: outcome.estimate })),
      ),
      Match.exhaustive,
    ),
})
