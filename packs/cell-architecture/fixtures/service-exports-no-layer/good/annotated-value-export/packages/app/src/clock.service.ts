import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { defaultDelay, formatTime } from './system-clock.js'

export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('app/Clock') {}

export const delayMs: number = defaultDelay

export const layerLabel = formatTime satisfies (millis: number) => string

export default formatTime
