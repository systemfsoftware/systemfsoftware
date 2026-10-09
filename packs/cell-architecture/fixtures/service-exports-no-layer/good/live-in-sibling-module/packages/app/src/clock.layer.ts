import * as Layer from 'effect/Layer'

import { Clock } from './clock.service.js'

export const ClockLive = Layer.succeed(Clock, Clock.of({ now: 0 }))
