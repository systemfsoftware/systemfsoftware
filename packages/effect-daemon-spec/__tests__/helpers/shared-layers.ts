import { Layer } from 'effect'
import { Noop } from '../../src/daemon-reporter/daemon-reporter.adapter.js'
import { SupervisorBodyExecutorLive } from '../../src/daemon-reporter/mod.js'
import { LeaderLock } from '../../src/leader-lock/leader-lock.adapter.js'
import { WithLeaderLockExecutorLive } from '../../src/leader-lock/mod.js'

export const NoopLayer = Layer.mergeAll(
  WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
  SupervisorBodyExecutorLive.pipe(Layer.provide(Noop)),
)
