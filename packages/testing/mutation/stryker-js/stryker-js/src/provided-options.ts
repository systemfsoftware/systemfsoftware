import type { RunConfiguration } from './Plugin.js'

/**
 * The run's options exactly as the `RunConfiguration` service hands them over.
 *
 * Derived from the service rather than restated, because the two are not
 * interchangeable under `exactOptionalPropertyTypes`: reading a service widens
 * every optional property to include `undefined`, so the yielded value is not
 * assignable to the `StrykerOptions` the schema declares even though it is the
 * same data. Taking the type from its producer keeps them in step — a field
 * added to the options reaches this alias with no edit, and no assertion is
 * needed at the call site.
 */
export type ProvidedStrykerOptions = RunConfiguration['Service']
