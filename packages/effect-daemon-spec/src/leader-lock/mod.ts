import { Effect, Layer } from 'effect'
import { withLeaderLock, WithLeaderLockExecutorDeps } from '../internal/with-leader-lock.executor.js'
import { LeaderLock } from './leader-lock.adapter.js'

export * as Adapter from './leader-lock.adapter.js'
export * as Kernel from './leader-lock.kernel.js'
export * as Schema from './leader-lock.schema.js'
export * as Primitive from './lock-primitive.schema.js'
export { withLeaderLock, WithLeaderLockExecutorDeps }
export type { LeaderLockOptions } from '../internal/with-leader-lock.executor.js'

export const WithLeaderLockExecutorLive: Layer.Layer<WithLeaderLockExecutorDeps, never, LeaderLock> = Layer.effect(
  WithLeaderLockExecutorDeps,
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return { withLock: lock.withLock }
  }),
)
