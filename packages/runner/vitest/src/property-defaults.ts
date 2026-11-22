/**
 * The setup file that configures direct `Arbitrary` checks with the run's property budget, published as
 * `@systemfsoftware/vitest/property-defaults` and listed beside the guard in the shared Vitest config's `setupFiles`.
 * The budget is the one the runner's own properties use: the tier's runs, size and shrink cap, the seed its tier and
 * commit decide, and `PROPERTY_RUNS` and `PROPERTY_SEED` over both.
 *
 * @since 4.1.0
 */
import { Effect } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import { PropertyConfig, type PropertySettings } from './config.js'
import { checkDefaultsOf } from './internal/property/budget.js'
import { providedCommit } from './internal/provided.js'

/**
 * The check options direct `Arbitrary` checks take for a run's settings, seeded from the commit the run published.
 *
 * @since 4.2.0
 */
export const propertyTestDefaults = (settings: PropertySettings): Arbitrary.GlobalOptions =>
  checkDefaultsOf(settings, providedCommit())

const configureDirectChecks = Effect.gen(function*() {
  Arbitrary.configureGlobal(propertyTestDefaults(yield* PropertyConfig))
})

Effect.runSync(configureDirectChecks.pipe(Effect.provide(PropertyConfig.layer)))
