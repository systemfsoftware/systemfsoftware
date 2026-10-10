import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('app/Clock') {}

export { formatTime, layerCount } from './drivers/clock.js'
