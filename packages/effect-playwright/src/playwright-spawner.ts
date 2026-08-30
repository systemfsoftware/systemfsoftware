/**
 * Scoped browser provisioning for Effect programs.
 *
 * `PlaywrightSpawner.layer` configures how browsers are launched, and
 * `PlaywrightSpawner.withBrowser` provides the `Browser` service scoped to the
 * effect's lifetime.
 */

export * from './internal/playwright-spawner.js'
