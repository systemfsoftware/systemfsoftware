/**
 * The setup file that sets the run count of direct `Arbitrary` checks from the environment, published as
 * `@systemfsoftware/vitest/property-defaults` and listed beside the guard in the shared Vitest config's `setupFiles`.
 * The table it reads is `propertyTestDefaults`, re-exported here so a test can supply its own environment record.
 *
 * @since 4.1.0
 */
import * as Arbitrary from 'effect/Arbitrary'
import { propertyTestDefaults } from './internal/property/tiers.js'

export { propertyTestDefaults }

const processEnvironment = () => ({ ...(typeof process === 'undefined' ? undefined : process.env) })

Arbitrary.configureGlobal(propertyTestDefaults(processEnvironment()))
