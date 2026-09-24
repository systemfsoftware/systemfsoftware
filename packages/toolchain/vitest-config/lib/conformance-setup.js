/**
 * Hands each test's site tallies to the main process through vitest's own
 * channel: task meta is serialized from the worker with the test result.
 * The plugin turns on `globals`, so `afterEach` is the runner's own hook
 * without this file resolving a second copy of `vitest`. A project that
 * inherits the setup file twice registers twice; the second drain finds
 * nothing new and merges rather than overwriting.
 */
import { drain } from './conformance-runtime.js'

/** @typedef {import('./conformance-runtime.js').Tally} Tally */
/** @typedef {(fn: (context: { task: { meta: Record<string, unknown> } }) => void) => void} AfterEach */

const hook = /** @type {AfterEach} */ (Reflect.get(globalThis, 'afterEach'))

hook((context) => {
  const earlier = /** @type {Record<string, Tally>} */ (context.task.meta['conformance'] ?? {})
  context.task.meta['conformance'] = { ...earlier, ...drain() }
})
