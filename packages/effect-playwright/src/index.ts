/**
 * Effect services and value wrappers for browser automation with Playwright.
 *
 * The root entrypoint exposes Effect-based services, models, constructors, and
 * errors under the {@link Playwright} namespace. {@link PlaywrightSpawner}
 * provides scoped browser acquisition. Fallible operations report
 * {@link Playwright.PlaywrightError}.
 */

/**
 * Playwright's Chromium, Firefox, and WebKit browser engines re-exported from `playwright-core`.
 */
export { chromium, firefox, webkit } from 'playwright-core'
/**
 * Effect services, models, constructors, and errors for Playwright.
 */
export * as Playwright from './playwright-api.js'
/**
 * Scoped browser provisioning for Effect programs.
 */
export * as PlaywrightSpawner from './playwright-spawner.js'
