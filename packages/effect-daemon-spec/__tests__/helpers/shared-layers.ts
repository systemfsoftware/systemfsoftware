import { Layer } from 'effect'
import { Noop } from '../../src/daemon-reporter.adapter.js'
import { LeaderLock } from '../../src/mod.js'

export const NoopLayer = Layer.mergeAll(
  LeaderLock.Noop,
  Noop,
)
