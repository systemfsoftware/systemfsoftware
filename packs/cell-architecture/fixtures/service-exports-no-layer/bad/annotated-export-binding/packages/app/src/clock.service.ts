import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import * as ClockDriver from './drivers/clock.js'

export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('app/Clock') {}

export const clock: Layer.Layer<Clock> = ClockDriver.layer
