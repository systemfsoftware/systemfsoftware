/**
 * @internal A property budget a run provides itself under `test.provide`, which outranks its tier's. The record
 * carries no `replay`, because a replay token names one falsification rather than a default for every property.
 */
import type * as Arbitrary from 'effect/Arbitrary'
import { inject } from 'vitest'

/** @internal The `test.provide` key a run fills with its own check options. */
export const checkDefaultsKey = '@systemfsoftware/vitest:property-check'

/**
 * The check options a run supplies as its property default, minus `replay`. `record` asks the engine to write a
 * failing seed to the checked-in seed store, which it does unless a run opts out.
 *
 * @internal
 */
export interface PropertyBudget extends Omit<Arbitrary.CheckOptions, 'replay'> {
  /** Write failing seeds to the seed store; default true. A derandomized run never writes regardless. */
  readonly record?: boolean | undefined
}

/** @internal The check options a run supplies as its property default (KTD4). */
export type ProvidedCheckDefaults = PropertyBudget

/** @internal The property-check defaults a run provided through `test.provide`, or `undefined` when it provided none. */
export const providedCheckDefaults = (): ProvidedCheckDefaults | undefined => inject(checkDefaultsKey)
