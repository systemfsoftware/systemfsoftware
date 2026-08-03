import { Layer } from 'effect'
import { Noop } from '../../src/daemon-reporter.adapter.js'
import { LeaderLock, SupervisorBodyExecutorLive, WithLeaderLockExecutorLive } from '../../src/mod.js'

export const NoopLayer = Layer.mergeAll(
  WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
  SupervisorBodyExecutorLive.pipe(Layer.provide(Noop)),
)
