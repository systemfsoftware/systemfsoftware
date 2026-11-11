/**
 * @internal The configured property-check defaults: the `test.provide` key they arrive under, and the
 * reader the engine calls when a property resolves its budget. The record carries no `replay`, because a
 * replay token names one falsification rather than a default for every property.
 */
import type * as Arbitrary from 'effect/Arbitrary'
import { inject } from 'vitest'
import { providedBudgetOf } from './tiers.js'

/** @internal The `test.provide` key the shared config fills with this run's tier's check options. */
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

/**
 * @internal The property-check defaults a run provided through `test.provide`, else the tier's budget for this
 * process's environment, read from the same table the setup entry uses.
 */
export const providedCheckDefaults = (): ProvidedCheckDefaults =>
  inject(checkDefaultsKey) ?? providedBudgetOf(process.env)
