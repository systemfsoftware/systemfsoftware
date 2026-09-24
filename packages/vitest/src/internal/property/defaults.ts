/**
 * @internal The configured property-check defaults: the `test.provide` key they arrive under, and the
 * reader the engine calls when a property resolves its budget. The record carries no `replay`, because a
 * replay token names one falsification rather than a default for every property.
 */
import type * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import { inject } from 'vitest'

/** @internal The `test.provide` key the shared config fills with this run's tier's check options. */
export const checkDefaultsKey = '@systemfsoftware/vitest:property-check'

/** @internal The check options a run supplies as its property default, minus `replay`. */
export type ProvidedCheckDefaults = Omit<Arbitrary.CheckOptions, 'replay'>

/** @internal The configured property-check defaults, or `undefined` when the run provided none. */
export const providedCheckDefaults = (): ProvidedCheckDefaults | undefined => inject(checkDefaultsKey)
