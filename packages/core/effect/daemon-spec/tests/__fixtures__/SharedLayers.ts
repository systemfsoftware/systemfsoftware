import { Noop } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Layer } from 'effect'

export const NoopLayer = Layer.mergeAll(
  LeaderLock.Noop,
  Noop,
)
