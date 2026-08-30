/**
 * Effect services and value wrappers for browser automation with Playwright.
 *
 * The root entrypoint exposes Effect-based services, models, constructors, and
 * errors under the `Playwright` namespace. `PlaywrightSpawner` provides scoped
 * browser acquisition. Fallible operations report `Playwright.PlaywrightError`.
 *
 * @since 0.1.0
 */

/**
 * Playwright's Chromium, Firefox, and WebKit browser engines re-exported from `playwright-core`.
 *
 * @since 0.1.0
 */
export { chromium, firefox, webkit } from 'playwright-core'

export * as Playwright from './playwright-api.js'
export * as PlaywrightSpawner from './playwright-spawner.js'
