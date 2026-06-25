import { Layer } from 'effect'
import { DaemonReporter } from '../../daemon-reporter.js'
import { LeaderLock } from '../../leader-lock.js'

export const NoopLayer = Layer.mergeAll(LeaderLock.Noop, DaemonReporter.Noop)
