import { Layer } from 'effect'
import { Noop } from '../../src/DaemonReporterAdapter.js'
import { LeaderLock } from '../../src/mod.js'

export const NoopLayer = Layer.mergeAll(
  LeaderLock.Noop,
  Noop,
)
