import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { estimateCorrectedRate, EstimateCorrectedRateCommand } from '../estimate-corrected-rate.workflow.js'

/**
 * Every test set is *built*, never filtered: `size` positives and `size` negatives, then the
 * prediction list places `tp` true positives and `tn` true negatives so that
 * `tp + tn > size` is an arithmetic fact of the construction, not a hoped-for sample. The
 * Rogan–Gladen identity case goes further and realises the observed rate exactly: with
 * `n` items per class and the unlabelled length `n²`, the count of ones that realises
 * `θ·TPR + (1−θ)·(1−TNR)` is the integer `k·tp + (n−k)·(n−tn)`.
 */
const ones = (count: number): ReadonlyArray<number> => Array.from({ length: count }, () => 1)

const zeros = (count: number): ReadonlyArray<number> => Array.from({ length: count }, () => 0)

const mixOf = (count: number, offset: number): ReadonlyArray<number> =>
  Array.from({ length: count }, (_, index) => (index + Math.abs(offset)) % 2)

const routingCommandOf = (
  raw: readonly number[],
  unlabeledPredictions: ReadonlyArray<number>,
  confidence: number,
  iterations: number,
): EstimateCorrectedRateCommand => {
  const size = 2 + (Math.abs(raw[0] ?? 0) % 5)
  const tp = 1 + (Math.abs(raw[1] ?? 0) % size)
  const tn = size + 1 - tp + (Math.abs(raw[2] ?? 0) % tp)
  return new EstimateCorrectedRateCommand({
    testLabels: [...ones(size), ...zeros(size)],
    testPredictions: [...ones(tp), ...zeros(size - tp), ...zeros(tn), ...ones(size - tn)],
    unlabeledPredictions,
    iterations,
    confidence,
    seed: Math.abs(raw[5] ?? 0),
  })
}

const validCommandOf = (raw: readonly number[], confidence: number, iterations: number): EstimateCorrectedRateCommand =>
  routingCommandOf(raw, mixOf(1 + (Math.abs(raw[3] ?? 0) % 8), raw[4] ?? 0), confidence, iterations)

/** Labels and predictions coincide: TPR = TNR = 1, so the correction is the identity. */
const perfectCommandOf = (
  rawSize: number,
  rawLength: number,
  offset: number,
  seed: number,
): EstimateCorrectedRateCommand => {
  const size = 1 + (Math.abs(rawSize) % 5)
  const labels = [...ones(size), ...zeros(size)]
  return new EstimateCorrectedRateCommand({
    testLabels: labels,
    testPredictions: labels,
    unlabeledPredictions: mixOf(1 + (Math.abs(rawLength) % 8), offset),
    iterations: 100,
    confidence: 0.95,
    seed: Math.abs(seed),
  })
}

/**
 * `θ = k/n` built into both channels: TPR = tp/n, TNR = tn/n, and an unlabelled list whose
 * observed rate is `θ·TPR + (1−θ)·(1−TNR)` realised by an integer count of ones.
 */
const identityEstimateOf = (
  raw: readonly number[],
): { readonly command: EstimateCorrectedRateCommand; readonly trueRate: number } => {
  const size = 2 + (Math.abs(raw[0] ?? 0) % 5)
  const tp = 1 + (Math.abs(raw[1] ?? 0) % size)
  const tn = size + 1 - tp + (Math.abs(raw[2] ?? 0) % tp)
  const k = Math.abs(raw[3] ?? 0) % (size + 1)
  const universe = size * size
  const count = k * tp + (size - k) * (size - tn)
  return {
    command: routingCommandOf(raw, [...ones(count), ...zeros(universe - count)], 0.95, 100),
    trueRate: k / size,
  }
}

/** `tp + tn ≤ size` by construction: the judge is no better than random on these test pairs. */
const poorCommandOf = (raw: readonly number[]): EstimateCorrectedRateCommand => {
  const size = 2 + (Math.abs(raw[0] ?? 0) % 5)
  const tp = Math.abs(raw[1] ?? 0) % (size + 1)
  const tn = Math.abs(raw[2] ?? 0) % (size - tp + 1)
  return new EstimateCorrectedRateCommand({
    testLabels: [...ones(size), ...zeros(size)],
    testPredictions: [...ones(tp), ...zeros(size - tp), ...zeros(tn), ...ones(size - tn)],
    unlabeledPredictions: mixOf(1 + (Math.abs(raw[3] ?? 0) % 8), raw[4] ?? 0),
    iterations: 100,
    confidence: 0.95,
    seed: Math.abs(raw[5] ?? 0),
  })
}

const decisionOf = (command: EstimateCorrectedRateCommand) => Result.getOrThrow(estimateCorrectedRate(command))

const estimateOf = (command: EstimateCorrectedRateCommand): number => decisionOf(command).estimate

const boundsOf = (command: EstimateCorrectedRateCommand): { readonly lower: number; readonly upper: number } =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('EstimateCorrectedRateEstimate', (decision) => ({ lower: decision.lower, upper: decision.upper })),
    Match.tag('EstimateCorrectedRateNoValidSamples', () => ({ lower: 0, upper: 0 })),
    Match.exhaustive,
  )

const tagOf = (command: EstimateCorrectedRateCommand): string =>
  Result.match(estimateCorrectedRate(command), {
    onFailure: (error) => error._tag,
    onSuccess: (decision) => decision._tag,
  })

const meanOf = (values: ReadonlyArray<number>): number =>
  values.reduce((total, value) => total + value, 0) / values.length

it.prop(
  '∀c_PerfectJudge_≡ObservedRate',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([rawSize, rawLength, offset, seed]) => {
    const command = perfectCommandOf(rawSize, rawLength, offset, seed)
    const estimate = estimateOf(command)
    const observed = meanOf(command.unlabeledPredictions)
    return Math.abs(estimate - observed) < 1e-12
  },
)

it.prop(
  '∀c_RoganGladen_≡TrueRate',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => {
    const { command, trueRate } = identityEstimateOf([a, b, c, d, e, f])
    return Math.abs(estimateOf(command) - trueRate) < 1e-9
  },
)

it.prop(
  '∀c_PoorJudge_≡RefusedNoBetterThanRandom',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => tagOf(poorCommandOf([a, b, c, d, e, f])) === 'EstimateCorrectedRateNoBetterThanRandom',
)

it.prop(
  '∀c_AllPositiveLabels_≡RefusedOneClass',
  [Schema.Int, Schema.Int, Schema.Int],
  ([rawSize, rawLength, seed]) => {
    const labels = ones(1 + (Math.abs(rawSize) % 5))
    const command = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: mixOf(labels.length, seed),
      unlabeledPredictions: mixOf(1 + (Math.abs(rawLength) % 8), seed),
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(seed),
    })
    return tagOf(command) === 'EstimateCorrectedRateOneClassTestLabels'
  },
)

it.prop(
  '∀c_AllNegativeLabels_≡RefusedOneClass',
  [Schema.Int, Schema.Int, Schema.Int],
  ([rawSize, rawLength, seed]) => {
    const labels = zeros(1 + (Math.abs(rawSize) % 5))
    const command = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: mixOf(labels.length, seed),
      unlabeledPredictions: mixOf(1 + (Math.abs(rawLength) % 8), seed),
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(seed),
    })
    return tagOf(command) === 'EstimateCorrectedRateOneClassTestLabels'
  },
)

it.prop(
  '∀c_MalformedInput_≡OwnRefusalVariant',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([rawLength, rawOffset, rawSeed, rawSize]) => {
    const size = 1 + (Math.abs(rawSize) % 5)
    const unlabeled = mixOf(1 + (Math.abs(rawLength) % 8), rawOffset)
    const labels = [...ones(size), ...zeros(size)]
    const predictions = [...ones(size), ...zeros(size)]
    const emptyTest = new EstimateCorrectedRateCommand({
      testLabels: [],
      testPredictions: [],
      unlabeledPredictions: unlabeled,
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(rawSeed),
    })
    const emptyUnlabeled = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: predictions,
      unlabeledPredictions: [],
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(rawSeed),
    })
    const widened: ReadonlyArray<number> = labels
    const nonBinary = new EstimateCorrectedRateCommand({
      testLabels: widened.with(Math.abs(rawSeed) % widened.length, 2 + (Math.abs(rawSeed) % 5)),
      testPredictions: predictions,
      unlabeledPredictions: unlabeled,
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(rawSeed),
    })
    const mismatched = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: [...predictions, 1],
      unlabeledPredictions: unlabeled,
      iterations: 100,
      confidence: 0.95,
      seed: Math.abs(rawSeed),
    })
    const outside = [0.9 - 1, 0.9 + 1]
    const misconfident = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: predictions,
      unlabeledPredictions: unlabeled,
      iterations: 100,
      confidence: outside[Math.abs(rawSeed) % outside.length] ?? 0,
      seed: Math.abs(rawSeed),
    })
    const unbootstrapped = new EstimateCorrectedRateCommand({
      testLabels: labels,
      testPredictions: predictions,
      unlabeledPredictions: unlabeled,
      iterations: (Math.abs(rawSeed) % 2) - 1,
      confidence: 0.95,
      seed: Math.abs(rawSeed),
    })
    return (
      tagOf(emptyTest) === 'EstimateCorrectedRateEmptyInput' &&
      tagOf(emptyUnlabeled) === 'EstimateCorrectedRateEmptyInput' &&
      tagOf(nonBinary) === 'EstimateCorrectedRateNonBinaryValue' &&
      tagOf(mismatched) === 'EstimateCorrectedRateLengthMismatch' &&
      tagOf(misconfident) === 'EstimateCorrectedRateInvalidConfidence' &&
      tagOf(unbootstrapped) === 'EstimateCorrectedRateZeroIterations'
    )
  },
)

it.prop(
  '∀c_ConfidenceLevels_≡SameEstimateNestedInterval',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => {
    const narrow = validCommandOf([a, b, c, d, e, f], 0.9, 200)
    const wide = validCommandOf([a, b, c, d, e, f], 0.99, 200)
    const inner = boundsOf(narrow)
    const outer = boundsOf(wide)
    return estimateOf(narrow) === estimateOf(wide) && outer.upper - outer.lower >= inner.upper - inner.lower
  },
)

it.prop(
  '∀c_Estimate_≡SeedAndIterationIndependent',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => {
    const base = validCommandOf([a, b, c, d, e, f], 0.95, 200)
    const reseeded = validCommandOf([a, b, c, d, e, -(Math.abs(f) + 17)], 0.95, 137)
    const estimate = estimateOf(base)
    return estimate >= 0 && estimate <= 1 && estimate === estimateOf(reseeded)
  },
)

it.prop(
  '∀c_Seed_≡DeterministicOrderedBounds',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => {
    const first = boundsOf(validCommandOf([a, b, c, d, e, f], 0.95, 200))
    const second = boundsOf(validCommandOf([a, b, c, d, e, f], 0.95, 200))
    return first.lower === second.lower && first.upper === second.upper && first.lower <= first.upper &&
      first.lower >= 0 && first.upper <= 1
  },
)

it.prop(
  '∀c_SingleOneClassResample_≡PointEstimateWithoutInterval',
  [Schema.Int],
  ([raw]) => {
    const command = new EstimateCorrectedRateCommand({
      testLabels: [1, 0],
      testPredictions: [1, 0],
      unlabeledPredictions: [1],
      iterations: 1,
      confidence: 0.95,
      seed: [1, 4, 5, 9][Math.abs(raw) % 4] ?? 4,
    })
    return decisionOf(command).estimate === 1 && tagOf(command) === 'EstimateCorrectedRateNoValidSamples'
  },
)

it.prop(
  '∀c_SingleValidResample_≡CollapsedInterval',
  [Schema.Int],
  ([raw]) => {
    const command = new EstimateCorrectedRateCommand({
      testLabels: [1, 0],
      testPredictions: [1, 0],
      unlabeledPredictions: [1],
      iterations: 1,
      confidence: 0.95,
      seed: [0, 2, 3][Math.abs(raw) % 3] ?? 0,
    })
    const decision = decisionOf(command)
    return (
      decision.estimate === 1 &&
      tagOf(command) === 'EstimateCorrectedRateEstimate' &&
      boundsOf(command).lower === 1 &&
      boundsOf(command).upper === 1
    )
  },
)

it.prop(
  '∀c_UnlabelledArrangement_≡FixedObservedRate',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([a, b, c, d, e, f]) => {
    const length = 2 + (Math.abs(d) % 6)
    const positives = 1 + (Math.abs(e) % (length - 1))
    const arrangement = [...ones(positives), ...zeros(length - positives)]
    const base = routingCommandOf([a, b, c, d, e, f], arrangement, 0.95, 200)
    const mirrored = routingCommandOf([a, b, c, d, e, f], [...arrangement].reverse(), 0.95, 200)
    const left = boundsOf(base)
    const right = boundsOf(mirrored)
    return left.lower === right.lower && left.upper === right.upper
  },
)
