import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { Clock } from '../clock.service.js'

export const formatTime = (millis: number): string => `${millis}ms`

export const layerCount = 1

export const layer: Layer.Layer<Clock> = Layer.succeed(Clock, Clock.of({ now: Effect.succeed(0) }))
