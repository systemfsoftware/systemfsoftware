import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('app/Clock') {}

export { ClockLive } from './drivers/clock.js'
