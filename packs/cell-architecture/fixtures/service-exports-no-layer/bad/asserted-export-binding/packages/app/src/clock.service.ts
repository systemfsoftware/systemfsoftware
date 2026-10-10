import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import { layer } from './system-clock.js'

export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('app/Clock') {}

export const clock = layer as Layer.Layer<Clock>
