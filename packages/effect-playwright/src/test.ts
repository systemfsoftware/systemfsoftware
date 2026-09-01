/**
 * Playwright Test integration for Effect programs.
 *
 * Wraps the upstream `@playwright/test` API so tests can be written as Effect
 * programs with shared Effect layers.
 */

export * from '@playwright/test'
export * from './api/test.js'
export { test } from './api/test.js'
export { test as default } from './api/test.js'
