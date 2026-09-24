/**
 * Hands each test's site tallies to the main process through vitest's own
 * channel: task meta is serialized from the worker with the test result.
 *
 * The hook is vitest's own `afterEach`, imported explicitly. The shared config
 * leaves `globals` off, so there is no ambient hook to read; the fork refuses
 * only its own `@effect/vitest` `afterEach` export, and this module is runner
 * infrastructure in a runner-driving package, not a test. The import resolves
 * to the same Vitest the worker is running under.
 *
 * A project that inherits the setup file twice registers twice; the second
 * drain finds nothing new and merges rather than overwriting.
 */
import { afterEach } from 'vitest'

import { drain } from './conformance-runtime.js'

afterEach((context) => {
  const meta = /** @type {Record<string, unknown>} */ (context.task.meta)
  const earlier = /** @type {Record<string, import('./conformance-runtime.js').Tally>} */ (
    meta['conformance'] ?? {}
  )
  meta['conformance'] = { ...earlier, ...drain() }
})
