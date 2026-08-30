/**
 * Playwright Test integration for Effect programs.
 *
 * Wraps the upstream `@playwright/test` API so tests can be written as Effect
 * programs with shared Effect layers.
 *
 * @since 0.1.0
 */

export * from '@playwright/test'
export * from './internal/test.js'
export { test } from './internal/test.js'
export { test as default } from './internal/test.js'
