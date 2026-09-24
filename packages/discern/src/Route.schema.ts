import { Schema } from 'effect'

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
  probability: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
})

export type RouteCandidate<Ids extends string = string> = {
  readonly id: Ids
  readonly probability: number
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
