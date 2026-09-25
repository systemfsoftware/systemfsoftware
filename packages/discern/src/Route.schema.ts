/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const Probability = Schema.Finite.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  Schema.annotate({ identifier: 'Probability' }),
  Schema.brand('@systemfsoftware/discern/Probability'),
)
export type Probability = typeof Probability.Type

/**
 * One candidate in a routing distribution: a procedure id and the probability
 * the router gave it.
 *
 * A `ranked` list is ordered by descending probability, so its head is the
 * leader and its second entry the runner-up. Routing keeps the whole list, not
 * just the winner, because a caller measuring a registry needs the distribution
 * the thresholds were applied to.
 */
export const RouteCandidate = Schema.Struct({
  id: Schema.String,
  probability: Probability,
})

export type RouteCandidate<Ids extends string = string> = {
  readonly id: Ids
  readonly probability: Probability
}

/**
 * The thresholds a routing decision must clear before it counts as confident.
 *
 * A leader under `minProbability`, or one ahead of the runner-up by less than
 * `minMargin`, is reported as uncertainty instead of being picked on a hair.
 * Both are tunable per call, because how decisive a registry has to be depends
 * on what the request costs.
 */
export interface RouteOptions {
  readonly minProbability?: number
  readonly minMargin?: number
}

const probabilitySeeds = [-0.01, 0, 1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

const inUnitInterval = (value: number): boolean => value >= 0 && value <= 1

const probabilityDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(Probability)(value))

if (import.meta.vitest !== void 0) {
  // tsdown defines `import.meta.vitest` as `undefined`, so a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀p_ProbabilityRefusal_∈Bounds',
    { of: [Schema.Finite], subject: probabilityDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(probabilitySeeds, value),
        (candidate) => subject(candidate) === inUnitInterval(candidate),
      ),
  )
}
