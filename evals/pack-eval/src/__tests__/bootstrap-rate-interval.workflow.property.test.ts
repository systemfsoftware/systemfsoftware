import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  bootstrapRateInterval,
  BootstrapRateIntervalCommand,
  BootstrapRateIntervalNoItems,
  BootstrapRateIntervalRate,
} from '../bootstrap-rate-interval.workflow.js'

/**
 * The decisions are read through accessors rather than class identity, so a law names the
 * observable value and never the variant it happened to be carried by. `NoItems` is the only
 * variant with no rate, so its accessors answer with the identity element of their codomain:
 * rate `-1` can never be a rate in `[0, 1]`, and a `{ lower: 0, upper: 0 }` pair is the
 * trivial interval that keeps the ordering laws meaningful instead of letting `NaN` poison them.
 */
const commandOf = (
  outcomes: ReadonlyArray<number>,
  iterations: number,
  confidence: number,
  seed: number,
): BootstrapRateIntervalCommand => new BootstrapRateIntervalCommand({ outcomes, iterations, confidence, seed })

const decisionOf = (command: BootstrapRateIntervalCommand) => Result.getOrThrow(bootstrapRateInterval(command))

const rateOf = (command: BootstrapRateIntervalCommand): number =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('BootstrapRateIntervalRate', (decision) => decision.rate),
    Match.tag('BootstrapRateIntervalNoItems', () => -1),
    Match.exhaustive,
  )

const boundsOf = (command: BootstrapRateIntervalCommand): { readonly lower: number; readonly upper: number } =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('BootstrapRateIntervalRate', (decision) => ({ lower: decision.lower, upper: decision.upper })),
    Match.tag('BootstrapRateIntervalNoItems', () => ({ lower: 0, upper: 0 })),
    Match.exhaustive,
  )

const tagOf = (command: BootstrapRateIntervalCommand): string =>
  Result.match(bootstrapRateInterval(command), {
    onFailure: (error) => error._tag,
    onSuccess: (decision) => decision._tag,
  })

const isRate = (command: BootstrapRateIntervalCommand): boolean =>
  Schema.is(BootstrapRateIntervalRate)(decisionOf(command))

const meanOf = (outcomes: ReadonlyArray<number>): number =>
  outcomes.reduce((total, outcome) => total + outcome, 0) / outcomes.length

it.prop(
  '∀o_Rate_≡ItemMean',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, iterations, confidence, seed]) => {
    const rate = rateOf(commandOf(outcomes, iterations, confidence, seed))
    const mean = meanOf(outcomes)
    return isRate(commandOf(outcomes, iterations, confidence, seed)) && Math.abs(rate - mean) < 1e-12 && rate >= 0 &&
      rate <= 1
  },
)

it.prop(
  '∀o_Bounds_≡UnitOrdered',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, iterations, confidence, seed]) => {
    const { lower, upper } = boundsOf(commandOf(outcomes, iterations, confidence, seed))
    return lower <= upper && lower >= 0 && upper <= 1
  },
)

it.prop(
  '∀o_Seed_≡DeterministicBounds',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, iterations, confidence, seed]) => {
    const first = boundsOf(commandOf(outcomes, iterations, confidence, seed))
    const second = boundsOf(commandOf(outcomes, iterations, confidence, seed))
    return first.lower === second.lower && first.upper === second.upper
  },
)

it.prop(
  '∀o_EmptyItems_≡NoItems',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([iterations, confidence, seed]) => {
    const command = commandOf([], iterations, confidence, seed)
    return Schema.is(BootstrapRateIntervalNoItems)(decisionOf(command)) &&
      tagOf(command) === 'BootstrapRateIntervalNoItems'
  },
)

it.prop(
  '∀o_NonBinaryOutcome_≡RefusedNonBinary',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, iterations, confidence, seed]) => {
    const values: ReadonlyArray<number> = outcomes
    const corrupted = values.with(Math.abs(seed) % values.length, 2 + (Math.abs(seed) % 5))
    return tagOf(commandOf(corrupted, iterations, confidence, seed)) === 'BootstrapRateIntervalNonBinaryValue'
  },
)

it.prop(
  '∀o_ConfidenceOutsideUnitInterval_≡RefusedInvalidConfidence',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 }))),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, iterations, innerConfidence, seed]) => {
    const outside = [innerConfidence - 1, innerConfidence + 1]
    const confidence = outside[Math.abs(seed) % outside.length] ?? 0
    return tagOf(commandOf(outcomes, iterations, confidence, seed)) === 'BootstrapRateIntervalInvalidConfidence'
  },
)

it.prop(
  '∀o_IterationsNonPositive_≡RefusedZeroIterations',
  [
    Schema.NonEmptyArray(Schema.Literals([0, 1])),
    Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.01, maximum: 0.99 }))),
    Schema.Int,
  ],
  ([outcomes, confidence, seed]) => {
    const iterations = (Math.abs(seed) % 2) - 1
    return tagOf(commandOf(outcomes, iterations, confidence, seed)) === 'BootstrapRateIntervalZeroIterations'
  },
)
