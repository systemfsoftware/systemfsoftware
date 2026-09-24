/**
 * The guard setup file, published as `@effect/vitest/guard` and listed in the shared Vitest config's
 * `setupFiles`. It installs the prototype guard once per worker and refuses any task the fork's `it` did not
 * register, so neither a raw `vitest` `expect` nor a raw `vitest` `it` can sit beside a fork check (KTD8).
 *
 * Both halves are internal plumbing; the fork's own `beforeEach` refusal is the user-facing one.
 *
 * @since 4.0.0
 */
import { beforeEach } from 'vitest'
import { installGuard, isMarked } from './internal/guard.js'
import { refuseRawIt } from './internal/refusals.js'

installGuard()

beforeEach((context) => {
  if (!isMarked(context.task)) throw new Error(refuseRawIt)
})
