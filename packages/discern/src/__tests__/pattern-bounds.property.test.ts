import { Discern } from '@systemfsoftware/discern'
import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Schema } from 'effect'

const risk = Discern.on(Schema.String).probability({ id: 'bounds-risk', instructions: 'Likely to regress' })

const isRefused = (pattern: Discern.Pattern<string>): boolean => pattern.refusals.length > 0

const aboveRefused = (threshold: number, miss: number): boolean => isRefused(risk.above(threshold, { missBelow: miss }))

const atLeastRefused = (threshold: number, miss: number): boolean =>
  isRefused(risk.atLeast(threshold, { missBelow: miss }))

const belowRefused = (threshold: number, miss: number): boolean => isRefused(risk.below(threshold, { missAbove: miss }))

const atMostRefused = (threshold: number, miss: number): boolean =>
  isRefused(risk.atMost(threshold, { missAbove: miss }))

const betweenRefused = (low: number, high: number): boolean => isRefused(risk.between(low, high))

const pairsOf = (first: number, second: number): ReadonlyArray<readonly [number, number]> =>
  Arr.flatMap([0, 1, first], (left) => Arr.map([0, 1, second, left], (right) => [left, right] as const))

it.prop(
  '∀t_AboveMissBound_≡StrictlyAboveThreshold',
  { of: [Schema.Finite, Schema.Finite], subject: aboveRefused },
  (subject, [threshold, miss]) =>
    Arr.every(pairsOf(threshold, miss), ([line, bound]) => subject(line, bound) === (bound > line)),
)

it.prop(
  '∀t_AtLeastMissBound_≡StrictlyAboveThreshold',
  { of: [Schema.Finite, Schema.Finite], subject: atLeastRefused },
  (subject, [threshold, miss]) =>
    Arr.every(pairsOf(threshold, miss), ([line, bound]) => subject(line, bound) === (bound > line)),
)

it.prop(
  '∀t_BelowMissBound_≡StrictlyBelowThreshold',
  { of: [Schema.Finite, Schema.Finite], subject: belowRefused },
  (subject, [threshold, miss]) =>
    Arr.every(pairsOf(threshold, miss), ([line, bound]) => subject(line, bound) === (bound < line)),
)

it.prop(
  '∀t_AtMostMissBound_≡StrictlyBelowThreshold',
  { of: [Schema.Finite, Schema.Finite], subject: atMostRefused },
  (subject, [threshold, miss]) =>
    Arr.every(pairsOf(threshold, miss), ([line, bound]) => subject(line, bound) === (bound < line)),
)

it.prop(
  '∀r_BetweenRange_≡LowAfterHigh',
  { of: [Schema.Finite, Schema.Finite], subject: betweenRefused },
  (subject, [low, high]) => Arr.every(pairsOf(low, high), ([start, end]) => subject(start, end) === (start > end)),
)
