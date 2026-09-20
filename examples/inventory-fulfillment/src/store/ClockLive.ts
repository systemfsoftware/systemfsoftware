import { DateTime, Layer } from 'effect'
import { NowClock } from '../ports/NowClock.js'

export const layer: Layer.Layer<NowClock> = Layer.succeed(NowClock, {
  now: DateTime.now,
})
